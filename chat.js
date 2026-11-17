const CHAT_ENDPOINT = "https://lorealchatbot.tmpark12.workers.dev/";
const MAX_QUESTION_LENGTH = 2000;
const STORAGE_KEY = "loreal-selected-products";
const LANGUAGE_KEY = "loreal-language";

const form = document.querySelector("#question-form");
const questionInput = document.querySelector("#question");
const askButton = document.querySelector("#ask-button");
const conversation = document.querySelector("#conversation");
const statusMessage = document.querySelector("#chat-status");
const topicButtons = [...document.querySelectorAll(".topic")];
const endChatButton = document.querySelector("#end-chat");
const endChatDialog = document.querySelector("#end-chat-dialog");
const nameForm = document.querySelector("#name-form");
const nameInput = document.querySelector("#preferred-name");
const skipNameButton = document.querySelector("#skip-name");
const topics = document.querySelector("#topics");
const questionSection = document.querySelector("#question-section");
const languageSelect = document.querySelector("#language");
const localizedLanguageLabel = document.querySelector("#localized-language");
const productButtons = [...document.querySelectorAll(".product-select")];
const selectedList = document.querySelector("#selected-products");
const selectionEmpty = document.querySelector("#selection-empty");
const clearProductsButton = document.querySelector("#clear-products");
const generateButton = document.querySelector("#generate-routine");
const routineStatus = document.querySelector("#routine-status");
const history = [];
const selectedProducts = new Set();
let language = "en";
let busy = false;
let preferredName = "";
let nameResolved = false;
let chatEnded = false;

function t(key) {
  return translations[language][key];
}

function renderSelection() {
  selectedList.replaceChildren();
  productButtons.forEach((button) => {
    const selected = selectedProducts.has(button.dataset.product);
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".product-selection").textContent = t(selected ? "selected" : "selectProduct");
    if (!selected) return;
    const name = button.querySelector("strong").textContent;
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = name;
    label.dir = "auto";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = t("remove");
    remove.setAttribute("aria-label", `${t("remove")}: ${name}`);
    remove.disabled = busy;
    remove.addEventListener("click", () => updateSelection(button.dataset.product, false));
    item.append(label, remove);
    selectedList.append(item);
  });
  selectionEmpty.hidden = selectedProducts.size > 0;
  clearProductsButton.disabled = busy || selectedProducts.size === 0;
}

function saveSelection() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedProducts]));
    routineStatus.textContent = "";
  } catch (error) {
    console.error("Unable to save product selection:", error);
    routineStatus.textContent = t("storageError");
  }
}

function updateSelection(id, selected) {
  if (selected) selectedProducts.add(id);
  else selectedProducts.delete(id);
  renderSelection();
  saveSelection();
}

function selectedProductData() {
  return productButtons.filter((button) => selectedProducts.has(button.dataset.product)).map((button) => ({
    id: button.dataset.product,
    name: button.querySelector("strong").textContent,
    description: document.getElementById(button.getAttribute("aria-describedby")).textContent,
  }));
}

function setLanguage(nextLanguage) {
  language = Object.hasOwn(translations, nextLanguage) ? nextLanguage : "en";
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  languageSelect.value = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
    element.alt = t(element.dataset.i18nAlt);
  });
  localizedLanguageLabel.hidden = language === "en";
  nameInput.setCustomValidity("");
  renderSelection();
}

let savedLanguage = "en";
try {
  const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
  if (Object.hasOwn(translations, storedLanguage)) savedLanguage = storedLanguage;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const ids = JSON.parse(saved);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      throw new Error("Invalid saved product selection.");
    }
    ids.filter((id) => productButtons.some((button) => button.dataset.product === id))
      .forEach((id) => selectedProducts.add(id));
  }
} catch (error) {
  console.error("Unable to load product selection:", error);
  routineStatus.textContent = t("storageError");
}
setLanguage(savedLanguage);
languageSelect.addEventListener("change", () => {
  setLanguage(languageSelect.value);
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.error("Unable to save language:", error);
    routineStatus.textContent = t("storageError");
  }
});
productButtons.forEach((button) => {
  button.addEventListener("click", () => updateSelection(button.dataset.product, !selectedProducts.has(button.dataset.product)));
});
clearProductsButton.addEventListener("click", () => {
  selectedProducts.clear();
  renderSelection();
  saveSelection();
});
generateButton.addEventListener("click", () => {
  if (!nameResolved || chatEnded) {
    routineStatus.textContent = t("startFirst");
  } else if (selectedProducts.size === 0) {
    routineStatus.textContent = t("selectFirst");
  } else {
    routineStatus.textContent = "";
    sendQuestion(t("routineQuestion"), null, "routine");
  }
});

function addMessage(text, role, isError = false, sources = [], isLoading = false) {
  const listItem = document.createElement("li");
  listItem.className = `conversation ${role === "user" ? "user-conversation" : "assistant-conversation"}`;
  if (isLoading) listItem.setAttribute("aria-hidden", "true");

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "L" : (Array.from(preferredName)[0] || "Y").toUpperCase();

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("p");
  name.className = "message-name";
  name.textContent = role === "assistant" ? t("assistantName") : (preferredName || t("you"));

  const message = document.createElement("div");
  message.className = `message${role === "user" ? " user-message" : ""}${isError ? " error-message" : ""}`;
  message.dir = "auto";
  
  // Parse formatted text (bold, bullets, sections)
  const messageContainer = parseFormattedText(text);
  message.append(messageContainer);
  
  if (sources.length > 0) {
    const sourceSection = document.createElement("div");
    sourceSection.className = "source-section";
    
    const sourceLabel = document.createElement("p");
    sourceLabel.className = "source-label";
    sourceLabel.textContent = t("sources");
    sourceSection.append(sourceLabel);
    
    const sourceList = document.createElement("ul");
    sourceList.className = "source-list";
    sources.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || new URL(source.url).hostname;
      item.append(link);
      sourceList.append(item);
    });
    sourceSection.append(sourceList);
    message.append(sourceSection);
  }
  content.append(name, message);
  listItem.append(avatar, content);
  conversation.append(listItem);
  conversation.scrollTop = conversation.scrollHeight;
  return listItem;
}

function parseFormattedText(text) {
  const container = document.createElement("div");
  container.className = "formatted-text";

  function appendFormattedText(element, text) {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    parts.forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        element.append(strong);
      } else {
        element.append(document.createTextNode(part));
      }
    });
  }
  
  // Split by double newlines for sections
  const sections = text.split(/\n\n+/);
  
  sections.forEach((section, sectionIndex) => {
    const lines = section.split("\n");
    let currentElement = null;
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      
      if (!trimmed) return;
      
      // Check for bullet points
      if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
        if (!currentElement || !currentElement.classList.contains("bullet-list")) {
          currentElement = document.createElement("ul");
          currentElement.className = "bullet-list";
          container.append(currentElement);
        }
        const li = document.createElement("li");
        appendFormattedText(li, trimmed.replace(/^[•\-]\s*/, ""));
        currentElement.append(li);
      }
      // Check for section headers (all caps or ending with colon)
      else if (trimmed.match(/^[A-Z][A-Z\s]+:?$/) || trimmed.endsWith(":")) {
        const header = document.createElement("p");
        header.className = "section-header";
        header.textContent = trimmed.replace(/:$/, "");
        container.append(header);
        currentElement = null;
      }
      // Regular paragraph with bold formatting
      else {
        const p = document.createElement("p");
        appendFormattedText(p, trimmed);
        container.append(p);
        currentElement = null;
      }
    });
    
    // Add spacing between sections
    if (sectionIndex < sections.length - 1) {
      const spacer = document.createElement("div");
      spacer.style.height = "8px";
      container.append(spacer);
    }
  });
  
  return container;
}

function setBusy(isBusy) {
  busy = isBusy;
  askButton.disabled = isBusy || chatEnded;
  topicButtons.forEach((button) => {
    button.disabled = isBusy || chatEnded;
  });
  questionInput.disabled = isBusy || chatEnded;
  endChatButton.disabled = isBusy || chatEnded;
  generateButton.disabled = isBusy || chatEnded;
  languageSelect.disabled = isBusy;
  productButtons.forEach((button) => { button.disabled = isBusy; });
  renderSelection();
  askButton.textContent = t(isBusy ? "finding" : "askAway");
  if (isBusy) {
    statusMessage.textContent = t("loading");
  } else if (statusMessage.textContent === t("loading")) {
    statusMessage.textContent = "";
  }
}

async function sendQuestion(question, category = null, requestType = "chat") {
  if (chatEnded || !nameResolved || busy) return;
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    statusMessage.textContent = t("invalidQuestion");
    return;
  }

  addMessage(trimmedQuestion, "user");
  setBusy(true);
  const loadingMessage = addMessage(t("loading"), "assistant", false, [], true);
  if (requestType === "routine") conversation.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const requestMessages = [
    ...history.slice(-11).map((message) => ({ ...message, content: message.content.slice(0, MAX_QUESTION_LENGTH) })),
    { role: "user", content: trimmedQuestion },
  ];

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: requestMessages,
        category,
        preferredName: preferredName || null,
        language,
        requestType,
        selectedProducts: selectedProductData(),
      }),
    });

    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(t("serviceError"));
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(t("badReply"));
    }
    if (!response.ok) {
      console.error("Chat service error:", response.status, data?.error);
      throw new Error(t(data?.code === "sources_unavailable" ? "sourcesUnavailable" : "serviceError"));
    }
    if (typeof data?.reply !== "string" || !data.reply.trim()) {
      throw new Error(t("emptyReply"));
    }

    const reply = preferredName ? data.reply.replace(/\b(?:user|guest)\b/gi, () => preferredName) : data.reply;
    history.splice(0, history.length, ...requestMessages.slice(-11), { role: "assistant", content: reply });
    addMessage(reply, "assistant", false, Array.isArray(data.sources) ? data.sources : []);
    if (questionInput.value.trim() === trimmedQuestion) questionInput.value = "";
  } catch (error) {
    console.error("Chat request failed:", error);
    const message = error instanceof TypeError
      ? t("connectionError")
      : error.message;
    addMessage(message, "assistant", true);
    statusMessage.textContent = t("notSent");
  } finally {
    loadingMessage.remove();
    conversation.scrollTop = conversation.scrollHeight;
    setBusy(false);
  }
}

function startChat(name) {
  preferredName = name.trim();
  nameResolved = true;
  nameForm.hidden = true;
  topics.hidden = false;
  questionSection.hidden = false;
  if (preferredName) addMessage(preferredName, "user");
  const welcomeMessage = addMessage(
    preferredName ? t("welcomeName").replace("{name}", () => preferredName) : t("welcome"),
    "assistant",
  );
  const routineLink = document.createElement("a");
  routineLink.className = "routine-link";
  routineLink.href = "#routine-builder";
  routineLink.textContent = t("openRoutine");
  welcomeMessage.querySelector(".message").append(routineLink);
  questionInput.focus();
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!nameInput.value.trim()) {
    nameInput.setCustomValidity(t("invalidName"));
    nameInput.reportValidity();
    return;
  }
  startChat(nameInput.value);
});

nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
skipNameButton.addEventListener("click", () => startChat(""));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion(questionInput.value);
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!askButton.disabled) form.requestSubmit();
  }
});

topicButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sendQuestion(t(button.dataset.promptKey), button.dataset.category);
  });
});

function clearChatHistory() {
  history.splice(0, history.length);
  conversation.querySelectorAll("li").forEach((item) => item.remove());
  preferredName = "";
  nameResolved = false;
  chatEnded = false;
  questionInput.value = "";
  statusMessage.textContent = "";
  nameForm.hidden = false;
  topics.hidden = true;
  questionSection.hidden = true;
  setBusy(false);
}

endChatButton.addEventListener("click", () => {
  chatEnded = true;
  nameForm.hidden = true;
  setBusy(false);
  endChatDialog.showModal();
});
