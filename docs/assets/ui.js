const toastContainerId = "toast-container";

export function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    if (key === "className") {
      element.className = value;
    } else if (key === "textContent") {
      element.textContent = value;
    } else if (key === "innerHTML") {
      element.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });

  children.flat().forEach((child) => {
    if (child === null || child === undefined) {
      return;
    }
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  return element;
}

export function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function showToast(message, type = "info") {
  const container = document.getElementById(toastContainerId);
  if (!container) {
    console.warn("toast container is missing");
    return;
  }
  const toast = el("div", { className: `toast toast-${type}` }, message);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function createSection(title, description = "") {
  const section = el("section", { className: "panel" });
  section.appendChild(el("h2", { textContent: title }));
  if (description) {
    section.appendChild(el("p", { className: "panel-lead", textContent: description }));
  }
  return section;
}

export function formField(label, control, description = "") {
  const wrapper = el("label", { className: "form-field" });
  wrapper.appendChild(el("span", { className: "form-label", textContent: label }));
  wrapper.appendChild(control);
  if (description) {
    wrapper.appendChild(el("small", { className: "form-hint", textContent: description }));
  }
  return wrapper;
}

export function createButton(text, { type = "button", variant = "primary" } = {}) {
  return el("button", { type, className: `btn btn-${variant}` }, text);
}

export function ensureSnapshot(state, root) {
  if (state.snapshot) {
    return Promise.resolve(state.snapshot);
  }
  const placeholder = el("div", { className: "inline-status" }, "設定を取得しています...");
  root.appendChild(placeholder);
  return state
    .pullSnapshot()
    .then((snapshot) => {
      placeholder.remove();
      showToast("サーバーから設定を読み込みました。", "success");
      return snapshot;
    })
    .catch((error) => {
      placeholder.textContent = error.message || "設定の取得に失敗しました。";
      placeholder.classList.add("error");
      throw error;
    });
}

export function spinner() {
  return el("span", { className: "spinner", "aria-hidden": "true" });
}

export function toggleLoading(element, loading) {
  if (loading) {
    element.classList.add("is-loading");
  } else {
    element.classList.remove("is-loading");
  }
}

export function labeledSwitch(label, checked = false) {
  const input = el("input", { type: "checkbox" });
  input.checked = checked;
  return formField(label, input);
}

export function textInput({
  type = "text",
  value = "",
  placeholder = "",
  name,
  required = false,
  pattern,
}) {
  const input = el("input", { type, value, placeholder });
  if (name) {
    input.name = name;
  }
  if (required) {
    input.required = true;
  }
  if (pattern) {
    input.pattern = pattern;
  }
  return input;
}

export function textarea({ value = "", rows = 6, name, placeholder = "" }) {
  const area = el("textarea", { rows, placeholder });
  area.value = value;
  if (name) {
    area.name = name;
  }
  return area;
}

export function select({ options = [], value, name }) {
  const selectEl = el("select", {});
  if (name) {
    selectEl.name = name;
  }
  options.forEach((option) => {
    const opt = el("option", { value: option.value, textContent: option.label });
    if (value !== undefined && option.value === value) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });
  return selectEl;
}
