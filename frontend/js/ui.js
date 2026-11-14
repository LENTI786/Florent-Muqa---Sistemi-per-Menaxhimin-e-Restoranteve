// Funksione ndihmëse për ndërfaqen

// Mbron nga XSS: i kthen karakteret e veçanta në tekst të sigurt
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(value) {
  return Number(value).toFixed(2) + ' €';
}

function showAlert(containerId, message, type = 'danger') {
  document.getElementById(containerId).innerHTML =
    `<div class="alert alert-${type}" role="alert">${escapeHtml(message)}</div>`;
}

function clearAlert(containerId) {
  document.getElementById(containerId).innerHTML = '';
}

// Çaktivizon butonin dhe ndryshon tekstin gjatë ngarkimit
function setLoading(button, isLoading, text) {
  if (isLoading) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.textContent = text || 'Prit...';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
  }
}

// Shiriti i navigimit (i njëjtë në të gjitha faqet pas hyrjes)
function renderNavbar(user, active) {
  const roleNames = { ADMIN: 'Administrator', WAITER: 'Kamarier', KITCHEN: 'Kuzhinier' };
  const links = [
    { id: 'menu', label: 'Menuja', href: 'menu.html', roles: ['ADMIN', 'WAITER', 'KITCHEN'] },
  ];

  const items = links
    .filter(link => link.roles.includes(user.role))
    .map(link => `
      <li class="nav-item">
        <a class="nav-link ${link.id === active ? 'active' : ''}" href="${link.href}">${link.label}</a>
      </li>`)
    .join('');

  document.getElementById('navbar').innerHTML = `
    <nav class="navbar navbar-expand-md navbar-dark bg-dark">
      <div class="container">
        <a class="navbar-brand" href="menu.html">Restoranti</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#nav-menu" aria-controls="nav-menu"
                aria-expanded="false" aria-label="Hap menunë">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="nav-menu">
          <ul class="navbar-nav me-auto">${items}</ul>
          <span class="navbar-text me-3">${escapeHtml(user.name)} (${roleNames[user.role]})</span>
          <button id="logout-btn" class="btn btn-outline-light btn-sm">Dil</button>
        </div>
      </div>
    </nav>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
}