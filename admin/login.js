import { apiFetch, ApiError } from "./api.js";

const form = document.getElementById("login-form");
const errorEl = document.getElementById("form-error");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const formData = new FormData(form);
  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    await apiFetch("/api/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
    window.location.href = "index.html";
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      showError("Incorrect email/username or password.");
    } else if (err instanceof ApiError && err.status === 403) {
      showError("Sign-in is not allowed from this origin.");
    } else {
      showError((err && err.message) || "Sign-in failed. Please try again.");
    }
  } finally {
    submitBtn.disabled = false;
  }
});
