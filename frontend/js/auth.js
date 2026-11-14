// Hyrja, dalja dhe kontrolli i rolit

const LOGIN_PAGE = 'index.html';

// Faqja ku shkon çdo rol pas hyrjes (do ta ndryshojmë kur të kemi faqet e tjera)
function homeFor(role) {
  const pages = { ADMIN: 'menu.html', WAITER: 'menu.html', KITCHEN: 'menu.html' };
  return pages[role] || LOGIN_PAGE;
}

// Kthen përdoruesin e kyçur, ose null nëse nuk je i kyçur
async function getCurrentUser() {
  try {
    const res = await api.get('auth/me.php');
    return res.user;
  } catch (err) {
    if (err.status === 401) {
      return null;
    }
    throw err;
  }
}

// Kërkon hyrje. Nëse nuk je i kyçur, të çon te faqja e login-it.
async function requireAuth(allowedRoles) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    user = null;
  }
  if (!user) {
    window.location.href = LOGIN_PAGE;
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = homeFor(user.role);
    return null;
  }
  return user;
}

async function logout() {
  try {
    await api.post('auth/logout.php');
  } finally {
    window.location.href = LOGIN_PAGE;
  }
}