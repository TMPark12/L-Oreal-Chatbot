const CHAT_ENDPOINT = "https://lorealchatbot.tmpark12.workers.dev/";
const MAX_QUESTION_LENGTH = 2000;

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
const history = [];
let preferredName = "";
let nameResolved = false;
let chatEnded = false;

function addMessage(text, role, isError = false, sources = []) {
  const listItem = document.createElement("li");
  listItem.className = `conversation ${role === "user" ? "user-conversation" : "assistant-conversation"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "L" : (Array.from(preferredName)[0] || "Y").toUpperCase();

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("p");
  name.className = "message-name";
  name.textContent = role === "assistant" ? "L'ORÉAL BEAUTY ASSISTANT" : (preferredName || "You");

  const message = document.createElement("div");
  message.className = `message${role === "user" ? " user-message" : ""}${isError ? " error-message" : ""}`;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  message.append(paragraph);
  if (sources.length > 0) {
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
    message.append(sourceList);
  }
  content.append(name, message);
  listItem.append(avatar, content);
  conversation.append(listItem);
  conversation.scrollTop = conversation.scrollHeight;
}

function setBusy(isBusy) {
  askButton.disabled = isBusy || chatEnded;
  topicButtons.forEach((button) => {
    button.disabled = isBusy || chatEnded;
  });
  questionInput.disabled = isBusy || chatEnded;
  endChatButton.disabled = isBusy || chatEnded;
  askButton.textContent = isBusy ? "THINKING…" : "ASK AWAY";
  statusMessage.textContent = isBusy ? "Just a moment, we're finding an answer for you." : "";
}

async function sendQuestion(question, category = null) {
  if (chatEnded || !nameResolved) return;
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    statusMessage.textContent = "Please enter a question of 1–2,000 characters.";
    return;
  }

  addMessage(trimmedQuestion, "user");
  setBusy(true);
  const requestMessages = [...history.slice(-11), { role: "user", content: trimmedQuestion }];

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: requestMessages,
        category,
        preferredName: preferredName || null,
      }),
    });

    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Our chat service is temporarily unavailable. Please try again shortly.");
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("We couldn't read the chat reply. Please try again shortly.");
    }
    if (!response.ok) {
      throw new Error(data?.error || "We're unable to answer right now. Please try again in a moment.");
    }
    if (typeof data?.reply !== "string" || !data.reply.trim()) {
      throw new Error("We didn't receive a reply. Please try again.");
    }

    history.splice(0, history.length, ...requestMessages.slice(-11), { role: "assistant", content: data.reply });
    addMessage(data.reply, "assistant", false, Array.isArray(data.sources) ? data.sources : []);
    if (questionInput.value.trim() === trimmedQuestion) questionInput.value = "";
  } catch (error) {
    console.error("Chat request failed:", error);
    const message = error instanceof TypeError
      ? "I'm sorry! Our chat connection is temporarily unavailable. Please try again shortly."
      : error.message;
    addMessage(message, "assistant", true);
    statusMessage.textContent = "Your question wasn't sent. You can try again.";
  } finally {
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
  addMessage(
    preferredName
      ? `It's lovely to meet you, ${preferredName}! Choose a topic below, or ask me anything about L'Oréal beauty.`
      : "I'm happy you're here! Choose a topic below, or ask me anything about L'Oréal beauty.",
    "assistant",
  );
  questionInput.focus();
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!nameInput.value.trim()) {
    nameInput.setCustomValidity("Please enter a name or continue without one.");
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

topicButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sendQuestion(button.dataset.prompt, button.dataset.category);
  });
});

endChatButton.addEventListener("click", () => {
  chatEnded = true;
  nameForm.hidden = true;
  setBusy(false);
  endChatDialog.showModal();
});
