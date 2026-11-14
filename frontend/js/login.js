document.addEventListener('DOMContentLoaded', async () => {
  // Nëse je tashmë i kyçur, shko direkt te faqja jote
  try {
    const existing = await getCurrentUser();
    if (existing) {
      window.location.href = homeFor(existing.role);
      return;
    }
  } catch (err) {
    // nëse serveri nuk përgjigjet, lëre formën të hapur
  }

  const form = document.getElementById('login-form');
  const button = document.getElementById('login-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert('alert');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Validimi në frontend (backend-i e kontrollon përsëri)
    if (email === '' || password === '') {
      showAlert('alert', 'Shkruaj email-in dhe fjalëkalimin.');
      return;
    }

    setLoading(button, true, 'Duke u kyçur...');
    try {
      const res = await api.post('auth/login.php', { email, password });
      window.location.href = homeFor(res.user.role);
    } catch (err) {
      showAlert('alert', err.message);
    } finally {
      setLoading(button, false);
    }
  });
});