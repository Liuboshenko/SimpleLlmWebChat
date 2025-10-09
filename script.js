const apiUrl = 'http://10.27.192.116:8888/v1/chat/completions';
const model = 'qwen3-14b';
const maxTokens = 4096;
let history = [];

const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');

// Функция для печатающего эффекта
// Функция для печатающего эффекта
function typeWelcomeMessage() {
    const welcomeMessageDiv = document.getElementById('welcome-message');
    const message1 = 'Welcome to the BulatAI assistant';
    const message2 = 'How can I help you today?';
    let index = 0;
    let currentMessage = message1;

    function type() {
        if (index < currentMessage.length) {
            welcomeMessageDiv.textContent += currentMessage[index];
            index++;
            setTimeout(type, 100); // Скорость печати
        } else if (currentMessage === message1) {
            // Пауза перед очисткой и переключением на второе сообщение
            setTimeout(() => {
                welcomeMessageDiv.textContent = ''; // Очищаем после паузы
                index = 0;
                currentMessage = message2;
                setTimeout(type, 100); // Начало печати второго сообщения
            }, 900); // 0,8 секунд отображения первого сообщения
        }
    }

    type();
}

// Вызываем печатающий эффект при загрузке страницы
document.addEventListener('DOMContentLoaded', typeWelcomeMessage);

function addUserMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');
    
    const label = document.createElement('div');
    label.classList.add('user-label');
    label.textContent = 'Пользователь:';
    
    const contentDiv = document.createElement('div');
    contentDiv.textContent = content;
    
    messageDiv.appendChild(label);
    messageDiv.appendChild(contentDiv);
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return messageDiv;
}

function createAssistantMessageContainer() {
    const container = document.createElement('div');
    container.classList.add('message', 'assistant');
    
    const reasoningPanel = document.createElement('div');
    reasoningPanel.classList.add('reasoning-panel');
    
    const reasoningHeader = document.createElement('div');
    reasoningHeader.classList.add('reasoning-header');
    reasoningHeader.innerHTML = '<strong>Рассуждения модели:</strong><span class="toggle-icon">-</span>';
    
    const reasoningContent = document.createElement('div');
    reasoningContent.classList.add('reasoning-content');
    reasoningContent.style.display = 'block';
    
    reasoningPanel.appendChild(reasoningHeader);
    reasoningPanel.appendChild(reasoningContent);
    
    reasoningHeader.addEventListener('click', () => {
        if (reasoningContent.style.display === 'none') {
            reasoningContent.style.display = 'block';
            reasoningHeader.querySelector('.toggle-icon').textContent = '-';
        } else {
            reasoningContent.style.display = 'none';
            reasoningHeader.querySelector('.toggle-icon').textContent = '+';
        }
    });
    
    const answerPanel = document.createElement('div');
    answerPanel.classList.add('answer-panel');
    answerPanel.innerHTML = '<strong>Ответ:</strong><div class="answer-content"></div>';
    
    container.appendChild(reasoningPanel);
    container.appendChild(answerPanel);
    
    messagesDiv.appendChild(container);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return {
        container,
        reasoningContent: reasoningContent,
        answerContent: container.querySelector('.answer-content')
    };
}

function copyToClipboard(text, btn) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✓'; // Указываем "скопировано"
            setTimeout(() => { btn.textContent = '⧉'; }, 2000); // Возвращаем "копировать"
        }).catch((err) => {
            console.error('Ошибка копирования через Clipboard API:', err);
            fallbackCopy(text, btn);
        });
    } else {
        fallbackCopy(text, btn);
    }
}

function fallbackCopy(text, btn) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy'); // Используем 'copy' как команду
        btn.textContent = '✓'; // Указываем "скопировано"
        setTimeout(() => { btn.textContent = '⧉'; }, 2000); // Возвращаем "копировать"
    } catch (err) {
        console.error('Ошибка копирования (fallback):', err);
    }
    document.body.removeChild(textArea);
}

function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-window-header')) return; // Avoid duplicates
        
        // Оборачиваем содержимое pre в div для управления видимостью
        const codeContent = document.createElement('div');
        codeContent.classList.add('code-content');
        codeContent.innerHTML = pre.innerHTML;
        pre.innerHTML = ''; // Очищаем pre
        pre.appendChild(codeContent);
        
        const codeElem = pre.querySelector('code');
        const textToCopy = (codeElem ? codeElem.textContent : codeContent.textContent).trim();
        
        // Создаем шапку
        const header = document.createElement('div');
        header.classList.add('code-window-header');
        
        // Кнопка "Свернуть"
        const collapseBtn = document.createElement('button');
        collapseBtn.classList.add('collapse-btn');
        collapseBtn.textContent = '–';
        collapseBtn.addEventListener('click', () => {
            codeContent.classList.toggle('hidden');
            collapseBtn.textContent = codeContent.classList.contains('hidden') ? '⛶' : '–';
        });
        
        // Кнопка "copy"
        const copyBtn = document.createElement('button');
        copyBtn.classList.add('copy-btn-header');
        copyBtn.textContent = '⧉';
        copyBtn.addEventListener('click', () => {
            copyToClipboard(textToCopy, copyBtn);
        });
        
        header.appendChild(collapseBtn);
        header.appendChild(copyBtn);
        
        pre.insertBefore(header, codeContent); // Добавляем шапку перед содержимым
    });
}

sendButton.addEventListener('click', async () => {
    const userInput = input.value.trim();
    if (!userInput) return;

    // Скрываем блок welcome-message при отправке первого сообщения
    const welcomeMessageDiv = document.getElementById('welcome-message');
    welcomeMessageDiv.classList.add('hidden');

    addUserMessage(userInput);
    history.push({ role: 'user', content: userInput });

    input.value = '';
    sendButton.disabled = true;

    const assistantMessage = createAssistantMessageContainer();
    let fullResponse = '';
    let reasoningText = '';
    let answerText = '';
    let inThinkingTag = false;

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    assistantMessage.answerContent.appendChild(typingIndicator);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: history,
                max_tokens: maxTokens,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0].delta.content;
                        if (content) {
                            fullResponse += content;
                            
                            if (content.includes('<think>')) {
                                inThinkingTag = true;
                                continue;
                            }
                            if (content.includes('</think>')) {
                                inThinkingTag = false;
                                continue;
                            }
                            
                            if (inThinkingTag) {
                                reasoningText += content;
                                assistantMessage.reasoningContent.innerHTML = marked.parse(reasoningText);
                                renderMathInElement(assistantMessage.reasoningContent, {
                                    delimiters: [
                                        { left: "$$", right: "$$", display: true },
                                        { left: "$", right: "$", display: false },
                                        { left: "\\(", right: "\\)", display: false },
                                        { left: "\\[", right: "\\]", display: true }
                                    ],
                                    throwOnError: false
                                });
                            } else {
                                answerText += content;
                                assistantMessage.answerContent.innerHTML = marked.parse(answerText);
                                renderMathInElement(assistantMessage.answerContent, {
                                    delimiters: [
                                        { left: "$$", right: "$$", display: true },
                                        { left: "$", right: "$", display: false },
                                        { left: "\\(", right: "\\)", display: false },
                                        { left: "\\[", right: "\\]", display: true }
                                    ],
                                    throwOnError: false
                                });
                            }
                            
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                    } catch (e) {
                        console.error('Ошибка парсинга JSON:', e);
                    }
                }
            }
        }

        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }

        addCopyButtons(assistantMessage.container);

        renderMathInElement(assistantMessage.container, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        history.push({ 
            role: 'assistant', 
            content: `<think>${reasoningText}</think>${answerText}`
        });
    } catch (error) {
        assistantMessage.answerContent.textContent = `Ошибка: ${error.message}`;
    } finally {
        sendButton.disabled = false;
    }
});
