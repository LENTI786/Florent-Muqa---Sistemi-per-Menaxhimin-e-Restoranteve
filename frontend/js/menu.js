document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();       // nëse nuk je i kyçur, të çon te login
  if (!user) {
    return;
  }
  renderNavbar(user, 'menu');
  await loadMenu();
});

async function loadMenu() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('menu-content');

  clearAlert('alert');
  content.innerHTML = '';
  loading.classList.remove('d-none');         // gjendja loading

  try {
    const res = await api.get('menu-items.php');
    renderMenu(res.data, content);
  } catch (err) {
    showAlert('alert', err.message);          // gjendja error
  } finally {
    loading.classList.add('d-none');
  }
}

function renderMenu(items, container) {
  // gjendja empty
  if (items.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-5">Menuja është bosh.</div>';
    return;
  }

  // Grupo artikujt sipas kategorisë
  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category].push(item);
  });

  let html = '';
  Object.keys(groups).sort().forEach(category => {
    html += `<h2 class="h5 mt-4 mb-3">${escapeHtml(category)}</h2><div class="row g-3">`;
    groups[category].forEach(item => {
      html += `
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="card h-100 ${item.is_available ? '' : 'opacity-50'}">
            <div class="card-body d-flex justify-content-between align-items-start">
              <div>
                <h3 class="h6 mb-1">${escapeHtml(item.name)}</h3>
                ${item.is_available ? '' : '<span class="badge text-bg-secondary">Jo i disponueshëm</span>'}
              </div>
              <span class="fw-bold">${formatPrice(item.price)}</span>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
  });
  container.innerHTML = html;
}