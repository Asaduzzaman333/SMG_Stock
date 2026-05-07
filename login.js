import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loginWithEmail } from "./api-client.js";
import { sessionManager } from "./session-manager.js";

const h = React.createElement;

function formatRequestError(error, fallback) {
  if (!error) {
    return fallback;
  }

  const code = error.code ? ` (${error.code})` : "";
  const message = error.message ? ` ${error.message}` : "";
  return `${fallback}${code}${message}`;
}

function LoginApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    sessionManager.verifySession().then((user) => {
      if (user) {
        window.location.replace("/");
      }
    });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    try {
      await loginWithEmail(email.trim(), password);
      // Initialize session manager after successful login
      await sessionManager.initialize();
      window.location.replace("/");
    } catch (error) {
      setStatus(formatRequestError(error, "Login failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return h(
    "main",
    { className: "auth-shell" },
    h(
      "section",
      { className: "auth-panel" },
      h(
        "div",
        { className: "auth-brand" },
        h("img", { className: "brand-logo", src: "/smg-logo-blue.png", alt: "SMG Stock logo" }),
        h("div", null, h("strong", null, "SMG Stock"), h("p", null, "Secure inventory access")),
      ),
      h(
        "form",
        { className: "auth-form", id: "loginForm", onSubmit: handleSubmit },
        h(
          "label",
          null,
          h("span", null, "Email"),
          h("input", {
            id: "emailInput",
            name: "email",
            type: "email",
            autoComplete: "username",
            required: true,
            value: email,
            onChange: (event) => setEmail(event.target.value),
          }),
        ),
        h(
          "label",
          null,
          h("span", null, "Password"),
          h("input", {
            id: "passwordInput",
            name: "password",
            type: "password",
            autoComplete: "current-password",
            required: true,
            value: password,
            onChange: (event) => setPassword(event.target.value),
          }),
        ),
        h("p", { className: "auth-status", id: "loginStatus", "aria-live": "polite" }, status),
        h("button", { className: "primary-btn auth-submit", id: "loginBtn", type: "submit", disabled: isSubmitting }, "Login"),
      ),
    ),
  );
}

createRoot(document.querySelector("#root")).render(h(LoginApp));
