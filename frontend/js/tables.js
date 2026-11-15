
let tables = [];
let editingId = null;
let isAdmin = false;

// Kur hapet faqja
document.addEventListener('DOMContentLoaded', async () => {

    const user = await requireAuth();

    if (!user) {
        return;
    }

    isAdmin = user.role === 'ADMIN';

    renderNavbar(user, 'tables');

    // Forma shfaqet vetëm për administratorin
    if (isAdmin) {
        document.getElementById('table-form-card')
            .classList.remove('d-none');
    }

    document.getElementById('table-form')
        .addEventListener('submit', saveTable);

    document.getElementById('cancel-edit')
        .addEventListener('click', resetForm);

    document.getElementById('tables-content')
        .addEventListener('click', handleTableActions);

    await loadTables();
});


// Merr tavolinat nga databaza përmes API-së
async function loadTables() {

    const loading = document.getElementById('tables-loading');
    const content = document.getElementById('tables-content');

    loading.classList.remove('d-none');
    clearAlert('alert');

    try {

        const response = await api.get('tables.php');

        tables = response.data;

        renderTables();

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        loading.classList.add('d-none');

    }
}


// Shfaq tavolinat në faqe
function renderTables() {

    const content = document.getElementById('tables-content');

    if (tables.length === 0) {

        content.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-body text-center py-5">
                    <h5 class="fw-bold">Nuk ka tavolina</h5>
                    <p class="text-muted mb-0">
                        Ende nuk janë regjistruar tavolina.
                    </p>
                </div>
            </div>
        `;

        return;
    }

    let html = `
        <div class="card shadow-sm">
            <div class="table-responsive">
                <table class="table align-middle mb-0">

                    <thead class="table-light">
                        <tr>
                            <th>Nr.</th>
                            <th>Kapaciteti</th>
                            <th>Statusi</th>
                            ${isAdmin ? '<th>Veprimet</th>' : ''}
                        </tr>
                    </thead>

                    <tbody>
    `;

    tables.forEach(table => {

        const isFree = table.status === 'FREE';

        const statusBadge = isFree
            ? '<span class="badge text-bg-success">E lirë</span>'
            : '<span class="badge text-bg-danger">E zënë</span>';

        html += `
            <tr>

                <td class="fw-bold">
                    Tavolina ${escapeHtml(table.number)}
                </td>

                <td>
                    ${escapeHtml(table.capacity)} persona
                </td>

                <td>
                    ${statusBadge}
                </td>

                ${isAdmin ? `
                    <td>
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary me-1"
                            data-action="edit"
                            data-id="${Number(table.id)}"
                        >
                            Ndrysho
                        </button>

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-danger"
                            data-action="delete"
                            data-id="${Number(table.id)}"
                        >
                            Fshi
                        </button>
                    </td>
                ` : ''}

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


// Shton ose ndryshon një tavolinë
async function saveTable(event) {

    event.preventDefault();

    clearAlert('alert');

    const number = Number(
        document.getElementById('table-number').value
    );

    const capacity = Number(
        document.getElementById('table-capacity').value
    );

    const status = document.getElementById('table-status').value;

    if (!Number.isInteger(number) || number < 1 || number > 999) {
        showAlert('alert', 'Numri duhet të jetë nga 1 deri në 999.');
        return;
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
        showAlert('alert', 'Kapaciteti duhet të jetë nga 1 deri në 50.');
        return;
    }

    const button = document.getElementById('save-table-btn');

    button.disabled = true;
    button.textContent = 'Duke ruajtur...';

    try {

        let response;

        if (editingId !== null) {

            response = await api.patch(
                `tables.php?id=${editingId}`,
                {
                    number: number,
                    capacity: capacity,
                    status: status
                }
            );

        } else {

            response = await api.post(
                'tables.php',
                {
                    number: number,
                    capacity: capacity
                }
            );

        }

        resetForm();

        await loadTables();

        showAlert(
            'alert',
            response.message || 'Veprimi u krye me sukses.',
            'success'
        );

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        button.disabled = false;
        button.textContent = editingId === null
            ? 'Shto tavolinën'
            : 'Ruaj ndryshimet';

    }
}


// Kontrollon butonat Ndrysho dhe Fshi
async function handleTableActions(event) {

    const button = event.target.closest('[data-action]');

    if (!button || !isAdmin) {
        return;
    }

    const id = Number(button.dataset.id);

    const table = tables.find(item => Number(item.id) === id);

    if (!table) {
        return;
    }

    if (button.dataset.action === 'edit') {

        editingId = id;

        document.getElementById('table-number').value = table.number;
        document.getElementById('table-capacity').value = table.capacity;
        document.getElementById('table-status').value = table.status;

        document.getElementById('form-title').textContent =
            `Ndrysho tavolinën ${table.number}`;

        document.getElementById('save-table-btn').textContent =
            'Ruaj ndryshimet';

        document.getElementById('table-status-field')
            .classList.remove('d-none');

        document.getElementById('cancel-edit')
            .classList.remove('d-none');

        document.getElementById('table-form-card')
            .scrollIntoView({ behavior: 'smooth' });

    }

    if (button.dataset.action === 'delete') {

        const confirmed = window.confirm(
            `A dëshiron ta fshish tavolinën ${table.number}?`
        );

        if (!confirmed) {
            return;
        }

        try {

            const response = await api.delete(
                `tables.php?id=${id}`
            );

            await loadTables();

            showAlert(
                'alert',
                response.message || 'Tavolina u fshi me sukses.',
                'success'
            );

        } catch (err) {

            showAlert('alert', err.message);

        }

    }
}


// Kthehet forma në gjendjen fillestare
function resetForm() {

    editingId = null;

    document.getElementById('table-form').reset();

    document.getElementById('form-title').textContent =
        'Shto tavolinë të re';

    document.getElementById('save-table-btn').textContent =
        'Shto tavolinën';

    document.getElementById('table-status-field')
        .classList.add('d-none');

    document.getElementById('cancel-edit')
        .classList.add('d-none');

}
