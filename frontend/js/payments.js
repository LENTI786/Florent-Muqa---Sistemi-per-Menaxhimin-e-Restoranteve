
// Porositë që presin pagesë
let payableOrders = [];

// Historiku i pagesave
let paymentHistory = [];

// Përdoruesi aktual
let currentUser = null;


// Kur hapet faqja
document.addEventListener('DOMContentLoaded', async () => {

    currentUser = await requireAuth(['ADMIN', 'WAITER']);

    if (!currentUser) {
        return;
    }

    renderNavbar(currentUser, 'payments');

    // Rifreskimi i të dhënave
    document.getElementById('refresh-payments')
        .addEventListener('click', loadPaymentPage);

    // Regjistrimi i pagesës
    document.getElementById('payments-content')
        .addEventListener('click', handlePayment);

    // Filtrat
    document.getElementById('payment-filters')
        .addEventListener('submit', handleFilterSubmit);

    document.getElementById('reset-payment-filters')
        .addEventListener('click', resetPaymentFilters);

    // Detajet dhe anulimi
    document.getElementById('payment-history-content')
        .addEventListener('click', handleHistoryActions);

    // Shfaq kontrollet vetëm për ADMIN
    if (currentUser.role === 'ADMIN') {
        document.getElementById('payment-stats-section')
            .classList.remove('d-none');

        document.querySelectorAll('.admin-filter')
            .forEach(element => element.classList.remove('d-none'));
    }

    await loadPaymentPage();

});


// Ngarkon porositë dhe historikun
async function loadPaymentPage() {

    await Promise.all([
        loadPayableOrders(),
        loadPaymentHistory()
    ]);

}


// Merr porositë që janë shërbyer
async function loadPayableOrders() {

    const loading = document.getElementById('payments-loading');
    const content = document.getElementById('payments-content');

    loading.classList.remove('d-none');
    content.innerHTML = '';

    try {

        const response = await api.get('orders.php?status=SERVED');

        payableOrders = response.data || [];

        renderPayableOrders();

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        loading.classList.add('d-none');

    }

}


// Shfaq porositë që mund të paguhen
function renderPayableOrders() {

    const content = document.getElementById('payments-content');

    document.getElementById('payable-count').textContent =
        payableOrders.length;

    if (payableOrders.length === 0) {

        content.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-body text-center py-5">

                    <h5 class="fw-bold">
                        Nuk ka pagesa në pritje
                    </h5>

                    <p class="text-muted mb-0">
                        Porositë e shërbyera do të shfaqen këtu.
                    </p>

                </div>
            </div>
        `;

        return;
    }

    let html = '';

    payableOrders.forEach(order => {

        html += `
            <div class="card payment-card shadow-sm mb-3">
                <div class="card-body">

                    <div class="row align-items-center g-3">

                        <div class="col-md-5">

                            <h3 class="h6 fw-bold mb-2">
                                Porosia #${Number(order.id)}
                            </h3>

                            <p class="mb-1">
                                Tavolina ${Number(order.table_number)}
                            </p>

                            <p class="text-muted small mb-0">
                                Kamarieri: ${escapeHtml(order.waiter)}
                            </p>

                        </div>

                        <div class="col-md-3">

                            <span class="badge text-bg-success">
                                E shërbyer
                            </span>

                            <p class="fw-bold fs-5 mt-2 mb-0">
                                ${formatPrice(order.total)}
                            </p>

                        </div>

                        <div class="col-md-4">

                            <label
                                for="payment-method-${Number(order.id)}"
                                class="form-label"
                            >
                                Mënyra e pagesës
                            </label>

                            <select
                                id="payment-method-${Number(order.id)}"
                                class="form-select mb-2"
                            >
                                <option value="CASH">Para në dorë</option>
                                <option value="CARD">Kartelë</option>
                            </select>

                            <button
                                type="button"
                                class="btn btn-primary w-100"
                                data-action="pay"
                                data-id="${Number(order.id)}"
                            >
                                Regjistro pagesën
                            </button>

                        </div>

                    </div>

                </div>
            </div>
        `;

    });

    content.innerHTML = html;

}


// Regjistron pagesën për porosinë e zgjedhur
async function handlePayment(event) {

    const button = event.target.closest('[data-action="pay"]');

    if (!button) {
        return;
    }

    const orderId = Number(button.dataset.id);

    const order = payableOrders.find(
        item => Number(item.id) === orderId
    );

    if (!order) {
        return;
    }

    const methodSelect = document.getElementById(
        `payment-method-${orderId}`
    );

    const method = methodSelect.value;

    const paymentName = method === 'CASH'
        ? 'para në dorë'
        : 'me kartelë';

    const confirmed = window.confirm(
        `A dëshiron të regjistrosh pagesën ${paymentName} për porosinë #${orderId}?`
    );

    if (!confirmed) {
        return;
    }

    button.disabled = true;
    button.textContent = 'Duke regjistruar...';

    try {

        const response = await api.post('payments.php', {
            order_id: orderId,
            method: method
        });

        await loadPaymentPage();

        showAlert(
            'alert',
            `Pagesa për porosinë #${orderId} u regjistrua me sukses. Shuma: ${formatPrice(response.data.amount)}.`,
            'success'
        );

    } catch (err) {

        showAlert('alert', err.message);

        button.disabled = false;
        button.textContent = 'Regjistro pagesën';

    }

}


// Merr historikun e pagesave
async function loadPaymentHistory() {

    const loading = document.getElementById('history-loading');
    const content = document.getElementById('payment-history-content');

    loading.classList.remove('d-none');
    content.innerHTML = '';

    try {

        const params = new URLSearchParams();

        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;
        const orderId = document.getElementById('filter-order-id').value;

        if (dateFrom) {
            params.set('date_from', dateFrom);
        }

        if (dateTo) {
            params.set('date_to', dateTo);
        }

        if (orderId) {
            params.set('order_id', orderId);
        }

        // Filtrat shtesë vetëm për ADMIN
        if (currentUser.role === 'ADMIN') {

            const waiterId = document.getElementById('filter-waiter-id').value;
            const status = document.getElementById('filter-status').value;

            if (waiterId) {
                params.set('waiter_id', waiterId);
            }

            if (status) {
                params.set('status', status);
            }

        }

        const query = params.toString();

        const url = query
            ? `payments.php?${query}`
            : 'payments.php';

        const response = await api.get(url);

        paymentHistory = response.data || [];

        renderPaymentHistory();

        if (currentUser.role === 'ADMIN') {
            renderPaymentStats(response.stats);
        }

    } catch (err) {

        content.innerHTML = `
            <div class="alert alert-danger">
                ${escapeHtml(err.message)}
            </div>
        `;

    } finally {

        loading.classList.add('d-none');

    }

}


// Shfaq statistikat e ADMIN
function renderPaymentStats(stats) {

    if (!stats) {
        return;
    }

    document.getElementById('daily-revenue').textContent =
        formatPrice(stats.daily_revenue);

    document.getElementById('monthly-revenue').textContent =
        formatPrice(stats.monthly_revenue);

    document.getElementById('total-payments').textContent =
        Number(stats.total_payments || 0);

}


// Shfaq historikun e pagesave
function renderPaymentHistory() {

    const content = document.getElementById('payment-history-content');

    if (paymentHistory.length === 0) {

        content.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-body text-center py-5">

                    <h5 class="fw-bold">
                        Nuk ka pagesa në historik
                    </h5>

                    <p class="text-muted mb-0">
                        Pagesat e regjistruara do të shfaqen këtu.
                    </p>

                </div>
            </div>
        `;

        return;
    }

    let html = `
        <div class="card shadow-sm">
            <div class="table-responsive">

                <table class="table table-hover align-middle mb-0">

                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Porosia</th>
                            <th>Tavolina</th>
                            <th>Shuma</th>
                            <th>Mënyra</th>
                            <th>Statusi</th>
                            <th>Data</th>
                            <th>Veprime</th>
                        </tr>
                    </thead>

                    <tbody>
    `;

    paymentHistory.forEach(payment => {

        const statusBadge = payment.status === 'PAID'
            ? '<span class="badge text-bg-success">E paguar</span>'
            : '<span class="badge text-bg-danger">E anuluar</span>';

        const methodName = payment.method === 'CASH'
            ? 'Para në dorë'
            : 'Kartelë';

        html += `
            <tr>

                <td>#${Number(payment.id)}</td>

                <td>#${Number(payment.order_id)}</td>

                <td>${Number(payment.table_number)}</td>

                <td class="fw-bold">
                    ${formatPrice(payment.amount)}
                </td>

                <td>${methodName}</td>

                <td>${statusBadge}</td>

                <td>
                    ${escapeHtml(formatDateTime(payment.paid_at))}
                </td>

                <td>
                    <div class="d-flex gap-2">

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            data-action="details"
                            data-id="${Number(payment.id)}"
                        >
                            Detajet
                        </button>

                        ${
                            currentUser.role === 'ADMIN' &&
                            payment.status === 'PAID'
                                ? `
                                    <button
                                        type="button"
                                        class="btn btn-sm btn-outline-danger"
                                        data-action="cancel"
                                        data-id="${Number(payment.id)}"
                                    >
                                        Anulo
                                    </button>
                                `
                                : ''
                        }

                    </div>
                </td>

            </tr>
        `;

    });

    html += `
                    </tbody>

                </table>

            </div>
        </div>
    `;

    content.innerHTML = html;

}


// Formati i datës
function formatDateTime(value) {

    if (!value) {
        return '-';
    }

    return String(value).replace('T', ' ').slice(0, 19);

}


// Menaxhon detajet dhe anulimin
async function handleHistoryActions(event) {

    const button = event.target.closest('[data-action]');

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const paymentId = Number(button.dataset.id);

    const payment = paymentHistory.find(
        item => Number(item.id) === paymentId
    );

    if (!payment) {
        return;
    }

    if (action === 'details') {
        await showPaymentDetails(payment);
        return;
    }

    if (action === 'cancel') {
        await cancelPayment(payment, button);
    }

}




async function showPaymentDetails(payment) {

    const content = document.getElementById('payment-details-content');

    content.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border" role="status"></div>
            <p class="mt-2">Duke ngarkuar faturën...</p>
        </div>
    `;

    const modalElement = document.getElementById('payment-details-modal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();

    try {

        // Marrim detajet e pagesës nga API
        const response = await api.get(
            `payments.php?id=${Number(payment.id)}`
        );

        console.log('Përgjigjja nga API:', response);

        if (!response.success) {
            throw new Error(response.message || 'Nuk u gjet pagesa.');
        }

        // Nxjerrim të dhënat e faturës dhe artikujt
        const invoice = response.data.payment;
        const items = response.data.items || [];

        if (!invoice) {
            throw new Error('Të dhënat e faturës nuk u gjetën.');
        }

        const statusName = invoice.status === 'PAID'
            ? 'E paguar'
            : 'E anuluar';

        const methodName = invoice.method === 'CASH'
            ? 'Para në dorë'
            : 'Kartelë';

        let itemsHtml = '';

        if (items.length > 0) {

            itemsHtml = items.map(item => `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td class="text-center">${Number(item.quantity)}</td>
                    <td class="text-end">${formatPrice(item.unit_price)}</td>
                    <td class="text-end">${formatPrice(item.subtotal)}</td>
                </tr>
            `).join('');

        } else {

            itemsHtml = `
                <tr>
                    <td colspan="4" class="text-center text-muted">
                        Nuk ka artikuj në këtë porosi.
                    </td>
                </tr>
            `;
        }

        content.innerHTML = `

            <div class="row mb-3">

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">ID e pagesës</p>
                    <h6 class="fw-bold">#${Number(invoice.id)}</h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">ID e porosisë</p>
                    <h6 class="fw-bold">#${Number(invoice.order_id)}</h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Tavolina</p>
                    <h6 class="fw-bold">${Number(invoice.table_number)}</h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Statusi</p>
                    <h6 class="fw-bold">${statusName}</h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Mënyra e pagesës</p>
                    <h6 class="fw-bold">${methodName}</h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Data e pagesës</p>
                    <h6 class="fw-bold">
                        ${escapeHtml(formatDateTime(invoice.paid_at))}
                    </h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Kamarieri</p>
                    <h6 class="fw-bold">
                        ${escapeHtml(invoice.waiter_name || '-')}
                    </h6>
                </div>

                <div class="col-6 mb-3">
                    <p class="text-muted small mb-1">Regjistruar nga</p>
                    <h6 class="fw-bold">
                        ${escapeHtml(invoice.paid_by_name || 'Nuk është regjistruar')}
                    </h6>
                </div>

            </div>

            <hr>

            <h6 class="fw-bold mb-3">Artikujt e porosisë</h6>

            <div class="table-responsive">
                <table class="table table-bordered table-sm align-middle">

                    <thead class="table-light">
                        <tr>
                            <th>Artikulli</th>
                            <th class="text-center">Sasia</th>
                            <th class="text-end">Çmimi</th>
                            <th class="text-end">Nëntotali</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${itemsHtml}
                    </tbody>

                </table>
            </div>

            <div class="text-end mt-3">
                <p class="text-muted mb-1">Totali i faturës</p>
                <h4 class="fw-bold">${formatPrice(invoice.amount)}</h4>
            </div>

            ${
                invoice.status === 'CANCELLED'
                    ? `
                        <hr>
                        <h6 class="fw-bold text-danger mb-3">Të dhënat e anulimit</h6>

                        <p>
                            <strong>Anuluar më:</strong>
                            ${escapeHtml(formatDateTime(invoice.cancelled_at))}
                        </p>

                        <p>
                            <strong>Anuluar nga:</strong>
                            ${escapeHtml(invoice.cancelled_by_name || '-')}
                        </p>

                        <p>
                            <strong>Arsyeja:</strong>
                            ${escapeHtml(invoice.cancellation_reason || '-')}
                        </p>
                    `
                    : ''
            }

        `;

    } catch (error) {

        console.error('Gabim gjatë ngarkimit të faturës:', error);

        content.innerHTML = `
            <div class="alert alert-danger">
                ${escapeHtml(error.message || 'Gabim gjatë ngarkimit të faturës.')}
            </div>
        `;
    }
}



// Anulon pagesën - vetëm ADMIN
async function cancelPayment(payment, button) {

    if (currentUser.role !== 'ADMIN') {
        return;
    }

    const reason = window.prompt(
        `Shkruaj arsyen e anulimit të pagesës #${payment.id}:`
    );

    if (reason === null) {
        return;
    }

    const cleanReason = reason.trim();

    if (!cleanReason) {
        showAlert('alert', 'Duhet të shkruash arsyen e anulimit.');
        return;
    }

    if (cleanReason.length > 255) {
        showAlert('alert', 'Arsyeja nuk mund të ketë më shumë se 255 karaktere.');
        return;
    }

    const confirmed = window.confirm(
        `A je i sigurt që dëshiron ta anulosh pagesën #${payment.id}?`
    );

    if (!confirmed) {
        return;
    }

    button.disabled = true;
    button.textContent = 'Duke anuluar...';

    try {

        await api.patch('payments.php', {
            payment_id: payment.id,
            reason: cleanReason
        });

        await loadPaymentPage();

        showAlert(
            'alert',
            `Pagesa #${payment.id} u anulua me sukses.`,
            'success'
        );

    } catch (err) {

        showAlert('alert', err.message);

        button.disabled = false;
        button.textContent = 'Anulo';

    }

}


// Aplikon filtrat
async function handleFilterSubmit(event) {

    event.preventDefault();

    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;

    if (dateFrom && dateTo && dateFrom > dateTo) {
        showAlert('alert', 'Data "Nga data" nuk mund të jetë pas datës "Deri më".');
        return;
    }

    await loadPaymentHistory();

}


// Pastron filtrat
async function resetPaymentFilters() {

    document.getElementById('payment-filters').reset();

    await loadPaymentHistory();

}
