import { apiFetch, ApiError } from "./api.js";

const form = document.getElementById("register-form");
const errorEl = document.getElementById("form-error");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;

  const formData = new FormData(form);
  const username = String(formData.get("username") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    showError("Passwords do not match.");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    await apiFetch("/api/register", { method: "POST", body: JSON.stringify({ username, email, password }) });
    window.location.href = "index.html";
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      showError("That username or email is already registered.");
    } else if (err instanceof ApiError && err.status === 400) {
      showError(err.message);
    } else if (err instanceof ApiError && err.status === 403) {
      showError("Registration is not allowed from this origin.");
    } else {
      showError((err && err.message) || "Registration failed. Please try again.");
    }
  } finally {
    submitBtn.disabled = false;
  }
});
