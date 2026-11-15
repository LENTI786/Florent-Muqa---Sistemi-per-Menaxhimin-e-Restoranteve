
// ID e ushqimit që jemi duke ndryshuar
let editingItemId = null;

// Kategoritë e menusë
let menuCategories = [];

// Modal i Bootstrap
let menuModal;


// Kur hapet faqja
document.addEventListener('DOMContentLoaded', async () => {

    // Kontrollojmë kyçjen
    const user = await requireAuth();

    if (!user) {
        return;
    }

    // Shfaqim navigimin
    renderNavbar(user, 'menu');

    // Inicializojmë modalin
    menuModal = new bootstrap.Modal(
        document.getElementById('menu-item-modal')
    );

    // Butoni për shtimin e ushqimit
    const addButton = document.getElementById('add-menu-item');

    // Vetëm administratori mund të menaxhojë menunë
    if (user.role === 'ADMIN') {

        addButton.classList.remove('d-none');

        addButton.addEventListener('click', () => {
            prepareAddForm();
        });

        // Ngarkojmë kategoritë
        await loadCategories();

    }

    // Ngarkojmë ushqimet
    await loadMenu();

    // Dërgimi i formularit
    document.getElementById('menu-item-form')
        .addEventListener('submit', saveMenuItem);

    // Klikimet në kartelat e ushqimeve
    document.getElementById('menu-content')
        .addEventListener('click', handleMenuActions);

    // Pastrojmë formularin kur mbyllet modali
    document.getElementById('menu-item-modal')
        .addEventListener('hidden.bs.modal', resetForm);

});


// Merr kategoritë nga databaza
async function loadCategories() {

    try {

        const res = await api.get('categories.php');

        menuCategories = res.data || [];

        const select = document.getElementById('item-category');

        select.innerHTML = `
            <option value="">Zgjidh kategorinë</option>
            ${menuCategories.map(category => `
                <option value="${Number(category.id)}">
                    ${escapeHtml(category.name)}
                </option>
            `).join('')}
        `;

    } catch (err) {

        showAlert('alert', err.message);

    }

}


// Merr ushqimet nga API
async function loadMenu() {

    const loading = document.getElementById('loading');
    const content = document.getElementById('menu-content');

    clearAlert('alert');

    content.innerHTML = '';

    loading.classList.remove('d-none');

    try {

        const res = await api.get('menu-items.php');

        renderMenu(res.data || [], content);

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        loading.classList.add('d-none');

    }

}


// Shfaq ushqimet sipas kategorive
function renderMenu(items, container) {

    if (items.length === 0) {

        container.innerHTML = `
            <div class="text-center text-muted py-5">
                Menuja është bosh.
            </div>
        `;

        return;
    }

    // Grupimi sipas kategorisë
    const groups = {};

    items.forEach(item => {

        if (!groups[item.category]) {
            groups[item.category] = [];
        }

        groups[item.category].push(item);

    });

    let html = '';

    Object.keys(groups).sort().forEach(category => {

        html += `
            <h2 class="h5 mt-4 mb-3">
                ${escapeHtml(category)}
            </h2>

            <div class="row g-3">
        `;

        groups[category].forEach(item => {

            const available = item.is_available === true ||
                              Number(item.is_available) === 1;

            html += `
                <div class="col-12 col-sm-6 col-lg-4">

                    <div class="card h-100 ${
                        available ? '' : 'opacity-50'
                    }">

                        <div class="card-body">

                            <div class="d-flex justify-content-between align-items-start">

                                <div>

                                    <h3 class="h6 mb-1">
                                        ${escapeHtml(item.name)}
                                    </h3>

                                    ${
                                        available
                                        ? '<span class="badge text-bg-success">I disponueshëm</span>'
                                        : '<span class="badge text-bg-secondary">Jo i disponueshëm</span>'
                                    }

                                </div>

                                <span class="fw-bold">
                                    ${formatPrice(item.price)}
                                </span>

                            </div>

                            ${
                                document.getElementById('add-menu-item').classList.contains('d-none')
                                ? ''
                                : `
                                    <div class="d-flex gap-2 mt-3">

                                        <button
                                            class="btn btn-sm btn-outline-primary"
                                            data-action="edit"
                                            data-id="${Number(item.id)}">

                                            Ndrysho

                                        </button>

                                        <button
                                            class="btn btn-sm btn-outline-danger"
                                            data-action="delete"
                                            data-id="${Number(item.id)}">

                                            Fshi

                                        </button>

                                        <button
                                            class="btn btn-sm btn-outline-secondary"
                                            data-action="toggle"
                                            data-id="${Number(item.id)}">

                                            ${available ? 'Çaktivizo' : 'Aktivizo'}

                                        </button>

                                    </div>
                                `
                            }

                        </div>

                    </div>

                </div>
            `;

        });

        html += '</div>';

    });

    container.innerHTML = html;

}


// Përgatit formularin për shtimin e ushqimit
function prepareAddForm() {

    editingItemId = null;

    document.getElementById('menu-modal-title').textContent =
        'Shto ushqim të ri';

    document.getElementById('save-menu-item').textContent =
        'Ruaj ushqimin';

    document.getElementById('menu-item-form').reset();

    document.getElementById('item-available').checked = true;

    clearAlert('modal-alert');

}


// Përgatit formularin për ndryshimin e ushqimit
function prepareEditForm(item) {

    editingItemId = Number(item.id);

    document.getElementById('menu-modal-title').textContent =
        'Ndrysho ushqimin';

    document.getElementById('save-menu-item').textContent =
        'Ruaj ndryshimet';

    document.getElementById('item-name').value = item.name;

    document.getElementById('item-category').value =
        String(item.category_id);

    document.getElementById('item-price').value = item.price;

    document.getElementById('item-available').checked =
        item.is_available === true ||
        Number(item.is_available) === 1;

    clearAlert('modal-alert');

}


// Ruajtja e ushqimit
async function saveMenuItem(event) {

    event.preventDefault();

    const saveButton = document.getElementById('save-menu-item');

    const item = {

        name: document.getElementById('item-name').value.trim(),

        category_id: Number(
            document.getElementById('item-category').value
        ),

        price: Number(
            document.getElementById('item-price').value
        ),

        is_available: document.getElementById('item-available').checked

    };

    // Kontrollojmë të dhënat
    if (
        !item.name ||
        !item.category_id ||
        !Number.isFinite(item.price) ||
        item.price <= 0 ||
        item.price >= 10000
    ) {

        showAlert(
            'modal-alert',
            'Kontrollo emrin, kategorinë dhe çmimin.'
        );

        return;
    }

    saveButton.disabled = true;

    try {

        if (editingItemId === null) {

            // Shtimi i ushqimit
            await api.post('menu-items.php', item);

        } else {

            // Ndryshimi i ushqimit
            await api.patch(
                `menu-items.php?id=${editingItemId}`,
                item
            );

        }

        // Mbyllim modalin
        menuModal.hide();

        // Rifreskojmë menunë
        await loadMenu();

        showAlert(
            'alert',
            editingItemId === null
                ? 'Ushqimi u shtua me sukses.'
                : 'Ushqimi u ndryshua me sukses.',
            'success'
        );

    } catch (err) {

        showAlert('modal-alert', err.message);

    } finally {

        saveButton.disabled = false;

    }

}


// Trajton butonat Ndrysho, Fshi dhe Aktivizo
async function handleMenuActions(event) {

    const button = event.target.closest('button[data-action]');

    if (!button) {
        return;
    }

    const action = button.dataset.action;

    const id = Number(button.dataset.id);

    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    // Gjejmë ushqimin në listën aktuale
    try {

        const res = await api.get(`menu-items.php?id=${id}`);

        const item = res.data;

        if (action === 'edit') {

            prepareEditForm(item);

            menuModal.show();

        }

        else if (action === 'delete') {

            await deleteMenuItem(item);

        }

        else if (action === 'toggle') {

            await toggleAvailability(item);

        }

    } catch (err) {

        showAlert('alert', err.message);

    }

}


// Fshirja e ushqimit
async function deleteMenuItem(item) {

    const confirmed = confirm(
        `A je i sigurt që dëshiron ta fshish ushqimin "${item.name}"?`
    );

    if (!confirmed) {
        return;
    }

    try {

        await api.delete(`menu-items.php?id=${Number(item.id)}`);

        showAlert('alert', 'Ushqimi u fshi me sukses.', 'success');

        await loadMenu();

    } catch (err) {

        showAlert('alert', err.message);

    }

}


// Aktivizimi ose çaktivizimi i ushqimit
async function toggleAvailability(item) {

    const available = item.is_available === true ||
                      Number(item.is_available) === 1;

    try {

        await api.patch(
            `menu-items.php?id=${Number(item.id)}`,
            {
                is_available: !available
            }
        );

        showAlert(
            'alert',
            available
                ? 'Ushqimi u çaktivizua.'
                : 'Ushqimi u aktivizua.',
            'success'
        );

        await loadMenu();

    } catch (err) {

        showAlert('alert', err.message);

    }

}


// Pastrojmë formularin
function resetForm() {

    editingItemId = null;

    document.getElementById('menu-item-form').reset();

    clearAlert('modal-alert');

}
