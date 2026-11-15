
// Të dhënat e Dashboard-it
let dashboardOrders = [];
let dashboardTables = [];
let dashboardMenu = [];

let dashboardUserRole = null;


// Kur hapet Dashboard-i
document.addEventListener('DOMContentLoaded', async () => {

    // Kontrollojmë nëse përdoruesi është i kyçur
    const user = await requireAuth();

    if (!user) {
        return;
    }

    // Ruajmë rolin e përdoruesit
    dashboardUserRole = user.role;

    // Shfaqim navigimin
    renderNavbar(user, 'dashboard');

    // Emrat e roleve
    const roleNames = {
        ADMIN: 'Administrator',
        WAITER: 'Kamarier',
        KITCHEN: 'Kuzhinier'
    };

    // Shfaqim mesazhin e mirëseardhjes
    document.getElementById('welcome-message').textContent =
        `Paneli i punës: ${roleNames[user.role] || user.role}`;

    // Butoni për rifreskimin e të dhënave
    document.getElementById('refresh-dashboard')
        .addEventListener('click', loadDashboard);

    // Ngarkojmë Dashboard-in
    await loadDashboard();

});


// Merr të dhënat nga API
async function loadDashboard() {

    const loading = document.getElementById('dashboard-loading');
    const content = document.getElementById('dashboard-content');
    const refreshButton = document.getElementById('refresh-dashboard');

    // Shfaqim ngarkimin
    loading.classList.remove('d-none');
    content.classList.add('d-none');

    refreshButton.disabled = true;
    refreshButton.textContent = 'Duke rifreskuar...';

    // Pastrojmë gabimet e mëparshme
    clearAlert('alert');

    try {

        // Marrim porositë, tavolinat dhe produktet
        const [ordersResponse, tablesResponse, menuResponse] =
            await Promise.all([

                api.get('orders.php'),

                api.get('tables.php'),

                api.get('menu-items.php')

            ]);

        // Ruajmë të dhënat
        dashboardOrders = ordersResponse.data || [];
        dashboardTables = tablesResponse.data || [];
        dashboardMenu = menuResponse.data || [];

        // Shfaqim statistikat
        renderDashboard();

        // Shfaqim përmbajtjen
        content.classList.remove('d-none');

    } catch (err) {

        showAlert('alert', err.message);

    } finally {

        // Përfundojmë ngarkimin
        loading.classList.add('d-none');

        refreshButton.disabled = false;
        refreshButton.textContent = 'Rifresko të dhënat';

    }

}


// Shfaq Dashboard-in sipas rolit
function renderDashboard() {

    const statsContainer = document.getElementById('dashboard-stats');

    let stats = [];


    // STATISTIKAT PËR ADMINISTRATORIN
    if (dashboardUserRole === 'ADMIN') {

        // Numërojmë tavolinat e lira
        const freeTables = dashboardTables.filter(
            table => table.status === 'FREE'
        ).length;

        // Numërojmë tavolinat e zëna
        const occupiedTables = dashboardTables.filter(
            table => table.status === 'OCCUPIED'
        ).length;

        // Numërojmë produktet aktive
        const availableMenu = dashboardMenu.filter(
            item =>
                Number(item.is_available) === 1 ||
                item.is_available === true
        ).length;

        stats = [

            {
                title: 'Gjithsej tavolina',
                value: dashboardTables.length,
                description: 'Tavolinat në restorant',
                color: 'primary'
            },

            {
                title: 'Tavolina të lira',
                value: freeTables,
                description: 'Gati për klientë',
                color: 'success'
            },

            {
                title: 'Tavolina të zëna',
                value: occupiedTables,
                description: 'Aktualisht të përdorura',
                color: 'warning'
            },

            {
                title: 'Produkte në menu',
                value: dashboardMenu.length,
                description: `${availableMenu} produkte aktive`,
                color: 'info'
            },

            {
                title: 'Porosi gjithsej',
                value: dashboardOrders.length,
                description: 'Porositë e regjistruara',
                color: 'dark'
            },

            {
                title: 'Porosi në përgatitje',
                value: countOrders('IN_PREPARATION'),
                description: 'Në kuzhinë',
                color: 'warning'
            }

        ];

    }


    // STATISTIKAT PËR KAMARIERIN
    else if (dashboardUserRole === 'WAITER') {

        stats = [

            {
                title: 'Tavolina të lira',
                value: dashboardTables.filter(
                    table => table.status === 'FREE'
                ).length,
                description: 'Gati për klientë',
                color: 'success'
            },

            {
                title: 'Porositë e mia',
                value: dashboardOrders.length,
                description: 'Porositë e regjistruara',
                color: 'primary'
            },

            {
                title: 'Në përgatitje',
                value: countOrders('IN_PREPARATION'),
                description: 'Porosi në kuzhinë',
                color: 'warning'
            },

            {
                title: 'Gati për shërbim',
                value: countOrders('READY'),
                description: 'Presin të shërbehen',
                color: 'info'
            },

            {
                title: 'Pagesa në pritje',
                value: countOrders('SERVED'),
                description: 'Porosi që presin pagesë',
                color: 'dark'
            }

        ];

    }


    // STATISTIKAT PËR KUZHINIERIN
    else if (dashboardUserRole === 'KITCHEN') {

        stats = [

            {
                title: 'Porosi të reja',
                value: countOrders('NEW'),
                description: 'Presin përgatitjen',
                color: 'primary'
            },

            {
                title: 'Në përgatitje',
                value: countOrders('IN_PREPARATION'),
                description: 'Duke u përgatitur',
                color: 'warning'
            },

            {
                title: 'Porosi gati',
                value: countOrders('READY'),
                description: 'Gati për kamarierin',
                color: 'success'
            }

        ];

    }


    // Shfaqim kartelat e statistikave
    statsContainer.innerHTML = stats.map(stat => `

        <div class="col-12 col-sm-6 col-lg-4">

            <div class="card dashboard-stat-card shadow-sm h-100">

                <div class="card-body p-4">

                    <p class="text-muted mb-2">
                        ${stat.title}
                    </p>

                    <h2 class="fw-bold mb-2 text-${stat.color}">
                        ${stat.value}
                    </h2>

                    <small class="text-muted">
                        ${stat.description}
                    </small>

                </div>

            </div>

        </div>

    `).join('');


    // Shfaqim porositë e fundit
    renderRecentOrders();

}


// Numëron porositë sipas statusit
function countOrders(status) {

    return dashboardOrders.filter(
        order => order.status === status
    ).length;

}


// Shfaq pesë porositë e fundit
function renderRecentOrders() {

    const container = document.getElementById('recent-orders');

    // Rendisim porositë nga më e reja
    const recentOrders = [...dashboardOrders]
        .sort((a, b) => {

            return new Date(b.created_at) - new Date(a.created_at);

        })
        .slice(0, 5);


    // Nëse nuk ka porosi
    if (recentOrders.length === 0) {

        container.innerHTML = `

            <p class="text-muted text-center py-4 mb-0">
                Nuk ka porosi për t'u shfaqur.
            </p>

        `;

        return;

    }


    // Përkthimi i statuseve
    const statusNames = {

        NEW: 'E re',

        IN_PREPARATION: 'Në përgatitje',

        READY: 'Gati',

        SERVED: 'E shërbyer',

        PAID: 'E paguar',

        CANCELLED: 'E anuluar'

    };


    // Krijojmë tabelën e porosive
    container.innerHTML = `

        <div class="table-responsive">

            <table class="table align-middle mb-0">

                <thead>

                    <tr>
                        <th>Porosia</th>
                        <th>Tavolina</th>
                        <th>Kamarieri</th>
                        <th>Statusi</th>
                        <th>Totali</th>
                    </tr>

                </thead>

                <tbody>

                    ${recentOrders.map(order => `

                        <tr>

                            <td class="fw-bold">
                                #${Number(order.id)}
                            </td>

                            <td>
                                ${Number(order.table_number)}
                            </td>

                            <td>
                                ${escapeHtml(order.waiter)}
                            </td>

                            <td>
                                ${escapeHtml(
                                    statusNames[order.status] || order.status
                                )}
                            </td>

                            <td class="fw-bold">
                                ${formatPrice(order.total)}
                            </td>

                        </tr>

                    `).join('')}

                </tbody>

            </table>

        </div>

    `;

}
