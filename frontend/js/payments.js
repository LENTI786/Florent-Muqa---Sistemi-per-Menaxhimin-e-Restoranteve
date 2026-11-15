
// Porositë që presin pagesë
let payableOrders = [];


// Kur hapet faqja
document.addEventListener('DOMContentLoaded', async () => {

    // Vetëm administratori dhe kamarieri mund të hyjnë
    const user = await requireAuth(['ADMIN', 'WAITER']);

    if (!user) {
        return;
    }

    renderNavbar(user, 'payments');

    document.getElementById('refresh-payments')
        .addEventListener('click', loadPayableOrders);

    document.getElementById('payments-content')
        .addEventListener('click', handlePayment);

    await loadPayableOrders();

});


// Merr porositë që janë shërbyer
async function loadPayableOrders() {

    const loading = document.getElementById('payments-loading');
    const content = document.getElementById('payments-content');

    loading.classList.remove('d-none');
    content.innerHTML = '';

    try {

        const response = await api.get('orders.php?status=SERVED');

        payableOrders = response.data;

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
                                <option value="CASH">
                                    Para në dorë
                                </option>

                                <option value="CARD">
                                    Kartelë
                                </option>
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

        await loadPayableOrders();

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
