// Shërbimi i API-së: një vend i vetëm për të gjitha thirrjet te backend-i

const API_BASE = '/restaurant/api/';

// Gabim i personalizuar që mban kodin e statusit dhe mesazhin nga backend-i
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',          // dërgon cookie-n e session-it
  };
  if (options.body !== undefined) {
    config.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(API_BASE + path, config);
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR',
      'Nuk mund të lidhem me serverin. Kontrollo që Apache është i starturar.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // përgjigje që nuk është JSON
  }

  if (!response.ok || !data || data.success === false) {
    throw new ApiError(
      response.status,
      (data && data.error) || 'UNKNOWN_ERROR',
      (data && data.message) || 'Ndodhi një gabim.'
    );
  }
  return data;
}

const api = {
  get:    (path)       => apiRequest(path),
  post:   (path, body) => apiRequest(path, { method: 'POST', body }),
  patch:  (path, body) => apiRequest(path, { method: 'PATCH', body }),
  delete: (path)       => apiRequest(path, { method: 'DELETE' }),
};