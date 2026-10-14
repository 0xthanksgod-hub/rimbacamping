(() => {
  const { $ } = RC;
  RC.paintIcons();
  RC.api("/api/admin/me").then(() => location.replace("/admin/")).catch(() => {});
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]");
    const err = $("#login-error");
    err.hidden = true; btn.disabled = true;
    try {
      await RC.api("/api/admin/login", { method: "POST", body: { email: $("#email").value.trim(), password: $("#password").value } });
      location.href = "/admin/";
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false; btn.disabled = false;
    }
  });
})();
