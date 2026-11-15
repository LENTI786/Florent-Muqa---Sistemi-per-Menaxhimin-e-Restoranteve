
// Të dhënat që përdor faqja
let currentUser = null;
let availableTables = [];
let availableItems = [];
let orders = [];


// Kur hapet faqja
document.addEventListener('DOMContentLoaded', async () => {

    currentUser = await requireAuth();

    if (!currentUser) {
        return;
    }

    // Shfaq navigimin
    renderNavbar(currentUser, 'orders');

    const canCreate =
        currentUser.role === 'ADMIN' ||
        currentUser.role === 'WAITER';

    // Vetëm admini dhe kamarieri krijojnë porosi
    if (canCreate) {

        document.getElementById('create-order-card')
            .classList.remove('d-none');

        document.getElementById('order-form')
            .addEventListener('submit', createOrder);

        document.getElementById('add-order-item')
            .addEventListener('click', addOrderItem);

        document.getElementById('order-items')
            .addEventListener('click', handleItemActions);

        document.getElementById('order-items')
            .addEventListener('change', updateEstimatedTotal);

        document.getElementById('order-items')
            .addEventListener('input', updateEstimatedTotal);

        await loadFormData();
    }

    // Ngarkimi i porosive
    document.getElementById('orders-content')
        .addEventListener('click', handleOrderActions);

    document.getElementById('status-filter')
        .addEventListener('change', loadOrders);

    document.getElementById('refresh-orders')
        .addEventListener('click', loadOrders);

    await loadOrders();

});


// ======================================
// MERR TAVOLINAT DHE PRODUKTET
// ======================================

async function loadFormData() {

    try {

        const [tableResponse, itemResponse] = await Promise.all([
            api.get('tables.php'),
            api.get('menu-items.php')
        ]);

        availableTables = tableResponse.data.filter(
            table => table.status === 'FREE'
        );

        availableItems = itemResponse.data.filter(
            item => item.is_available
        );

        renderTableOptions();
        addOrderItem();

    } catch (err) {

        showAlert('alert', err.message);

    }

}


// Shfaq vetëm tavolinat e lira
function renderTableOptions() {

    const select = document.getElementById('order-table');

    if (availableTables.length === 0) {

        select.innerHTML = `
            <option value="">
                Nuk ka tavolina të lira
            </option>
        `;

        document.getElementById('submit-order').disabled = true;

        return;
    }

    select.innerHTML = `
        <option value="">Zgjedh tavolinën...</option>

        ${availableTables.map(table => `
            <option value="${Number(table.id)}">
                Tavolina ${Number(table.number)}
                - ${Number(table.capacity)} persona
            </option>
        `).join('')}
    `;

    document.getElementById('submit-order').disabled =
        availableItems.length === 0;

}


// ======================================
// SHTIMI I PRODUKTEVE NË FORMË
// ======================================

function addOrderItem() {

    const container = document.getElementById('order-items');

    const row = document.createElement('div');

    row.className = 'order-item-row row g-2 align-items-end mb-3';

    const options = availableItems.map(item => `
        <option value="${Number(item.id)}">
            ${escapeHtml(item.name)}
            - ${formatPrice(item.price)}
        </option>
    `).join('');

    row.innerHTML = `

        <div class="col-md-7">

            <label class="form-label">
                Produkti
            </label>

            <select class="form-select order-item-select" required>

                <option value="">
                    Zgjedh produktin...
                </option>

                ${options}

            </select>

        </div>


        <div class="col-7 col-md-3">

            <label class="form-label">
                Sasia
            </label>

            <input
                type="number"
                class="form-control order-item-quantity"
                min="1"
                max="100"
                value="1"
                required
            >

        </div>


        <div class="col-5 col-md-2">

            <button
                type="button"
                class="btn btn-outline-danger w-100"
                data-action="remove-item"
            >
                Largo
            </button>

        </div>

    `;

    container.appendChild(row);

    updateEstimatedTotal();

}


// Largo produktin nga formulari
function handleItemActions(event) {

    const button = event.target.closest('[data-action="remove-item"]');

    if (!button) {
        return;
    }

    const container = document.getElementById('order-items');

    if (container.children.length <= 1) {

        showAlert('alert', 'Porosia duhet të ketë të paktën një produkt.');

        return;
    }

    button.closest('.order-item-row').remove();

    updateEstimatedTotal();

}


// ======================================
// LLOGARITJA E TOTALIT TË PËRAFËRT
// ======================================

function updateEstimatedTotal() {

    let total = 0;

    document.querySelectorAll('.order-item-row').forEach(row => {

        const productId = Number(
            row.querySelector('.order-item-select').value
        );

        const quantity = Number(
            row.querySelector('.order-item-quantity').value
        );

        const product = availableItems.find(
            item => Number(item.id) === productId
        );

        if (product && Number.isInteger(quantity) && quantity > 0) {

            total += Number(product.price) * quantity;

        }

    });

    document.getElementById('order-total').textContent =
        formatPrice(total);

}


// ======================================
// KRIJIMI I POROSISË
// ======================================

async function createOrder(event) {

    event.preventDefault();

    clearAlert('alert');

    const tableId = Number(
        document.getElementById('order-table').value
    );

    if (!tableId) {

        showAlert('alert', 'Zgjedh një tavolinë.');

        return;
    }

    const items = [];

    let invalid = false;

    document.querySelectorAll('.order-item-row').forEach(row => {

        const menuItemId = Number(
            row.querySelector('.order-item-select').value
        );

        const quantity = Number(
            row.querySelector('.order-item-quantity').value
        );

        if (
            !menuItemId ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 100
        ) {
            invalid = true;
            return;
        }

        items.push({
            menu_item_id: menuItemId,
            quantity: quantity
        });

    });

    if (invalid || items.length === 0) {

        showAlert('alert', 'Kontrollo produktet dhe sasitë.');

        return;
    }

    const button = document.getElementById('submit-order');

    button.disabled = true;
    button.textContent = 'Duke krijuar porosinë...';

    try {

        const response = await api.post('orders.php', {

            table_id: tableId,
            items: items

        });

        document.getElementById('order-form').reset();

        document.getElementById('order-items').innerHTML = '';

        document.getElementById('order-total').textContent = '0.00 €';

        await loadFormData();
        await loadOrders();

        showAlert(
            'alert',
            `Porosia #${response.data.id} u krijua me sukses. Totali: ${formatPrice(response.data.total)}`,
            'success'
        );

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        button.disabled = false;
        button.textContent = 'Krijo porosinë';

    }

}


// ======================================
// NGARKIMI I POROSIVE
// ======================================

async function loadOrders() {

    const loading = document.getElementById('orders-loading');
    const content = document.getElementById('orders-content');

    loading.classList.remove('d-none');

    content.innerHTML = '';

    try {

        const status = document.getElementById('status-filter').value;

        const path = status
            ? `orders.php?status=${encodeURIComponent(status)}`
            : 'orders.php';

        const response = await api.get(path);

        orders = response.data;

        renderOrders();

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        loading.classList.add('d-none');

    }

}


// ======================================
// SHFAQJA E POROSIVE
// ======================================

function statusLabel(status) {

    const labels = {

        NEW: 'E re',
        IN_PREPARATION: 'Në përgatitje',
        READY: 'Gati',
        SERVED: 'E shërbyer',
        PAID: 'E paguar',
        CANCELLED: 'E anuluar'

    };

    return labels[status] || status;

}


function statusClass(status) {

    const classes = {

        NEW: 'text-bg-primary',
        IN_PREPARATION: 'text-bg-warning',
        READY: 'text-bg-success',
        SERVED: 'text-bg-info',
        PAID: 'text-bg-dark',
        CANCELLED: 'text-bg-danger'

    };

    return classes[status] || 'text-bg-secondary';

}


function renderOrders() {

    const container = document.getElementById('orders-content');

    if (orders.length === 0) {

        container.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-body text-center py-5">

                    <h5 class="fw-bold">
                        Nuk ka porosi
                    </h5>

                    <p class="text-muted mb-0">
                        Nuk u gjet asnjë porosi për këtë filtër.
                    </p>

                </div>
            </div>
        `;

        return;
    }

    let html = '';

    orders.forEach(order => {

        html += `

            <div class="card order-card shadow-sm mb-3">

                <div class="card-body">

                    <div class="d-flex flex-wrap justify-content-between
                        align-items-start gap-3">

                        <div>

                            <h3 class="h6 fw-bold mb-2">
                                Porosia #${Number(order.id)}
                            </h3>

                            <p class="mb-1">
                                <strong>Tavolina:</strong>
                                ${Number(order.table_number)}
                            </p>

                            <p class="text-muted small mb-1">
                                Kamarieri: ${escapeHtml(order.waiter)}
                            </p>

                            <p class="text-muted small mb-0">
                                ${escapeHtml(order.created_at)}
                            </p>

                        </div>


                        <div class="text-md-end">

                            <span class="badge ${statusClass(order.status)} mb-2">
                                ${statusLabel(order.status)}
                            </span>

                            <div class="fw-bold fs-5">
                                ${formatPrice(order.total)}
                            </div>

                        </div>

                    </div>


                    <div class="d-flex flex-wrap gap-2 mt-3">

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            data-action="details"
                            data-id="${Number(order.id)}"
                        >
                            Shiko produktet
                        </button>

                        ${renderStatusButtons(order)}

                    </div>

                    <div
                        id="order-details-${Number(order.id)}"
                        class="order-details d-none mt-3"
                    ></div>

                </div>

            </div>

        `;

    });

    container.innerHTML = html;

}


// ======================================
// VEPRIMET SIPAS ROLIT
// ======================================

function allowedNextStatuses(order) {

    const rules = {

        ADMIN: {
            NEW: ['IN_PREPARATION', 'CANCELLED'],
            IN_PREPARATION: ['READY', 'CANCELLED'],
            READY: ['SERVED', 'CANCELLED'],
            SERVED: ['CANCELLED']
        },

        WAITER: {
            NEW: ['CANCELLED'],
            READY: ['SERVED']
        },

        KITCHEN: {
            NEW: ['IN_PREPARATION'],
            IN_PREPARATION: ['READY']
        }

    };

    return rules[currentUser.role]?.[order.status] || [];

}


function renderStatusButtons(order) {

    const nextStatuses = allowedNextStatuses(order);

    const buttons = {

        IN_PREPARATION: 'Fillo përgatitjen',
        READY: 'Shëno si gati',
        SERVED: 'Shëno si të shërbyer',
        CANCELLED: 'Anulo porosinë'

    };

    return nextStatuses.map(status => `

        <button
            type="button"
            class="btn btn-sm ${status === 'CANCELLED'
                ? 'btn-outline-danger'
                : 'btn-outline-success'}"
            data-action="change-status"
            data-id="${Number(order.id)}"
            data-status="${status}"
        >
            ${buttons[status]}
        </button>

    `).join('');

}


// ======================================
// DETAJET DHE NDRYSHIMI I STATUSIT
// ======================================

async function handleOrderActions(event) {

    const button = event.target.closest('[data-action]');

    if (!button) {
        return;
    }

    const id = Number(button.dataset.id);

    if (button.dataset.action === 'details') {

        await toggleOrderDetails(id, button);

    }

    if (button.dataset.action === 'change-status') {

        await changeOrderStatus(
            id,
            button.dataset.status
        );

    }

}


// Merr detajet e një porosie
async function toggleOrderDetails(id, button) {

    const container = document.getElementById(`order-details-${id}`);

    if (!container) {
        return;
    }

    if (!container.classList.contains('d-none')) {

        container.classList.add('d-none');

        button.textContent = 'Shiko produktet';

        return;

    }

    button.disabled = true;

    try {

        const response = await api.get(`orders.php?id=${id}`);

        const order = response.data;

        let html = `
            <div class="border rounded p-3">

                <h4 class="h6 fw-bold mb-3">
                    Produktet e porosisë #${id}
                </h4>

                <div class="table-responsive">

                    <table class="table table-sm mb-2">

                        <thead>
                            <tr>
                                <th>Produkti</th>
                                <th>Sasia</th>
                                <th>Çmimi</th>
                            </tr>
                        </thead>

                        <tbody>
        `;

        order.items.forEach(item => {

            html += `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${Number(item.quantity)}</td>
                    <td>${formatPrice(item.unit_price)}</td>
                </tr>
            `;

        });

        html += `
                        </tbody>

                    </table>

                </div>

                <div class="text-end fw-bold">
                    Totali: ${formatPrice(order.total)}
                </div>

            </div>
        `;

        container.innerHTML = html;

        container.classList.remove('d-none');

        button.textContent = 'Fshih produktet';

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        button.disabled = false;

    }

}


// Ndryshon statusin e porosisë
async function changeOrderStatus(id, status) {

    const confirmed = window.confirm(
        `A dëshiron ta ndryshosh statusin në "${statusLabel(status)}"?`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await api.patch(
            `orders.php?id=${id}`,
            { status: status }
        );

        await loadOrders();

        showAlert(
            'alert',
            response.message || 'Statusi u ndryshua me sukses.',
            'success'
        );

        // Rifresko edhe tavolinat kur porosia anulohet
        if (status === 'CANCELLED') {

            const tableResponse = await api.get('tables.php');

            availableTables = tableResponse.data.filter(
                table => table.status === 'FREE'
            );

            if (
                currentUser.role === 'ADMIN' ||
                currentUser.role === 'WAITER'
            ) {
                renderTableOptions();
            }

        }

    } catch (err) {

        showAlert('alert', err.message);

    }

}
