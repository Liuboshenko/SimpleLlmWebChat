// Конфигурация API
const API_BASE_URL = 'http://localhost:8000';
const PIPELINE_URL = `${API_BASE_URL}/run_pipeline`;
const WS_BASE_URL = 'ws://localhost:8000/ws';

// Состояние приложения
let currentSessionId = null;
let currentWebSocket = null;
let isProcessing = false;

// DOM элементы
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');
const connectionStatus = document.getElementById('connection-status');

// Маппинг названий агентов на читаемые имена
const agentNames = {
    'system': 'Система',
    'group_manager': 'Групповой менеджер',
    'analyzer': 'Анализатор',
    'validator': 'Валидатор',
    'planner_router': 'Маршрутизатор планов',
    'info_planner': 'Планировщик информации',
    'ports_status_agent': 'Агент статуса портов',
    'manager': 'Менеджер'
};

// Маппинг типов событий на описания
const eventDescriptions = {
    'state_status_changed': 'Изменение статуса',
    'pipeline_started': 'Запуск pipeline',
    'agent_scheduled': 'Агент запланирован',
    'agent_started': 'Агент запущен',
    'agent_working': 'Агент работает',
    'agent_completed': 'Агент завершен',
    'validation_attempt': 'Попытка валидации',
    'validation_completed': 'Валидация завершена',
    'planner_routed': 'План маршрутизирован',
    'info_plan_created': 'План информации создан',
    'pipeline_planned': 'Pipeline спланирован',
    'custom_detail': 'Детали',
    'pipeline_finished': 'Pipeline завершен'
};

// Приветственное сообщение с печатающим эффектом
function typeWelcomeMessage() {
    const welcomeMessageDiv = document.getElementById('welcome-message');
    const message1 = 'Добро пожаловать в BulatAI assistant';
    const message2 = 'Чем могу помочь сегодня?';
    let index = 0;
    let currentMessage = message1;

    function type() {
        if (index < currentMessage.length) {
            welcomeMessageDiv.textContent += currentMessage[index];
            index++;
            setTimeout(type, 80);
        } else if (currentMessage === message1) {
            setTimeout(() => {
                welcomeMessageDiv.textContent = '';
                index = 0;
                currentMessage = message2;
                setTimeout(type, 100);
            }, 900);
        }
    }
    type();
}

document.addEventListener('DOMContentLoaded', typeWelcomeMessage);

// Обновление статуса подключения
function updateConnectionStatus(connected, text = null) {
    if (connected) {
        connectionStatus.className = 'connected';
        connectionStatus.querySelector('.status-text').textContent = text || 'Подключено';
    } else {
        connectionStatus.className = 'disconnected';
        connectionStatus.querySelector('.status-text').textContent = text || 'Отключено';
    }
}

// Создание сообщения пользователя
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

// Создание контейнера для ответа агентской системы
function createAgentResponseContainer(sessionId) {
    const container = document.createElement('div');
    container.classList.add('message', 'assistant', 'agent-response');
    container.dataset.sessionId = sessionId;

    // Заголовок с session_id
    const sessionHeader = document.createElement('div');
    sessionHeader.classList.add('session-header');
    sessionHeader.innerHTML = `<span class="session-label">Session:</span> <span class="session-id">${sessionId}</span>`;

    // Панель статусов агентов (сворачиваемая)
    const statusPanel = document.createElement('div');
    statusPanel.classList.add('status-panel');

    const statusHeader = document.createElement('div');
    statusHeader.classList.add('status-header');
    statusHeader.innerHTML = `
        <strong>Статус выполнения:</strong>
        <span class="status-indicator processing">
            <span class="pulse"></span>
            <span class="status-text">Обработка...</span>
        </span>
        <span class="toggle-icon">−</span>
    `;

    const statusContent = document.createElement('div');
    statusContent.classList.add('status-content');
    statusContent.style.display = 'block';

    const statusList = document.createElement('div');
    statusList.classList.add('status-list');
    statusContent.appendChild(statusList);

    statusPanel.appendChild(statusHeader);
    statusPanel.appendChild(statusContent);

    // Обработчик сворачивания/разворачивания
    statusHeader.addEventListener('click', () => {
        const isHidden = statusContent.style.display === 'none';
        statusContent.style.display = isHidden ? 'block' : 'none';
        statusHeader.querySelector('.toggle-icon').textContent = isHidden ? '−' : '+';
    });

    // Панель финального ответа
    const answerPanel = document.createElement('div');
    answerPanel.classList.add('answer-panel');
    answerPanel.style.display = 'none';
    answerPanel.innerHTML = '<strong>Ответ:</strong><div class="answer-content"></div>';

    container.appendChild(sessionHeader);
    container.appendChild(statusPanel);
    container.appendChild(answerPanel);

    messagesDiv.appendChild(container);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    return {
        container,
        statusList,
        statusIndicator: statusHeader.querySelector('.status-indicator'),
        answerPanel,
        answerContent: answerPanel.querySelector('.answer-content')
    };
}

// Добавление статуса события
function addStatusEvent(statusList, event) {
    const eventDiv = document.createElement('div');
    eventDiv.classList.add('status-event');

    const agentName = agentNames[event.agent_name] || event.agent_name;
    const eventDesc = eventDescriptions[event.event_type] || event.event_type;

    // Иконка статуса
    let statusIcon = '⏳';
    let statusClass = 'pending';

    if (event.event_type.includes('completed') || event.event_type.includes('finished')) {
        statusIcon = '✓';
        statusClass = 'completed';
    } else if (event.event_type.includes('started') || event.event_type.includes('working')) {
        statusIcon = '⟳';
        statusClass = 'working';
    } else if (event.event_type.includes('scheduled')) {
        statusIcon = '◷';
        statusClass = 'scheduled';
    } else if (event.event_type.includes('validation')) {
        if (event.payload?.is_valid === true) {
            statusIcon = '✓';
            statusClass = 'completed';
        } else if (event.payload?.is_valid === false) {
            statusIcon = '⚠';
            statusClass = 'warning';
        } else {
            statusIcon = '⟳';
            statusClass = 'working';
        }
    }

    eventDiv.classList.add(statusClass);

    // Формируем описание события
    let details = '';
    if (event.payload) {
        if (event.payload.stage) {
            details = ` → ${event.payload.stage}`;
        }
        if (event.payload.attempt) {
            details = ` (попытка ${event.payload.attempt}/${event.payload.max_attempts})`;
        }
        if (event.payload.old_status && event.payload.new_status) {
            details = ` → ${event.payload.new_status}`;
        }
        if (event.payload.planner_type) {
            details = ` → ${event.payload.planner_type}`;
        }
        if (event.payload.pipeline && Array.isArray(event.payload.pipeline)) {
            details = ` → [${event.payload.pipeline.join(', ')}]`;
        }
    }

    const timestamp = new Date().toLocaleTimeString('ru-RU');

    eventDiv.innerHTML = `
        <span class="event-icon">${statusIcon}</span>
        <span class="event-agent">${agentName}</span>
        <span class="event-desc">${eventDesc}${details}</span>
        <span class="event-time">${timestamp}</span>
    `;

    statusList.appendChild(eventDiv);

    // Автоскролл к последнему событию
    const statusContent = statusList.parentElement;
    statusContent.scrollTop = statusContent.scrollHeight;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Обработка финального ответа
function showFinalResponse(responseContainer, finalResponse) {
    // Обновляем индикатор статуса
    const statusIndicator = responseContainer.statusIndicator;
    statusIndicator.classList.remove('processing');
    statusIndicator.classList.add('completed');
    statusIndicator.querySelector('.status-text').textContent = 'Завершено';
    statusIndicator.querySelector('.pulse')?.remove();

    // Показываем панель ответа
    responseContainer.answerPanel.style.display = 'block';
    responseContainer.answerContent.innerHTML = marked.parse(finalResponse);

    // Рендерим математические формулы
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(responseContainer.answerContent, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false
        });
    }

    // Добавляем кнопки копирования для блоков кода
    addCopyButtons(responseContainer.container);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Показ ошибки
function showError(responseContainer, errorMessage) {
    const statusIndicator = responseContainer.statusIndicator;
    statusIndicator.classList.remove('processing');
    statusIndicator.classList.add('error');
    statusIndicator.querySelector('.status-text').textContent = 'Ошибка';
    statusIndicator.querySelector('.pulse')?.remove();

    responseContainer.answerPanel.style.display = 'block';
    responseContainer.answerContent.innerHTML = `<div class="error-message">Ошибка: ${errorMessage}</div>`;
}

// Копирование в буфер обмена
function copyToClipboard(text, btn) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = '⧉'; }, 2000);
        }).catch((err) => {
            console.error('Ошибка копирования:', err);
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
        document.execCommand('copy');
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⧉'; }, 2000);
    } catch (err) {
        console.error('Ошибка копирования (fallback):', err);
    }
    document.body.removeChild(textArea);
}

// Добавление кнопок копирования к блокам кода
function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-window-header')) return;

        const codeContent = document.createElement('div');
        codeContent.classList.add('code-content');
        codeContent.innerHTML = pre.innerHTML;
        pre.innerHTML = '';
        pre.appendChild(codeContent);

        const codeElem = pre.querySelector('code');
        const textToCopy = (codeElem ? codeElem.textContent : codeContent.textContent).trim();

        const header = document.createElement('div');
        header.classList.add('code-window-header');

        const collapseBtn = document.createElement('button');
        collapseBtn.classList.add('collapse-btn');
        collapseBtn.textContent = '−';
        collapseBtn.addEventListener('click', () => {
            codeContent.classList.toggle('hidden');
            collapseBtn.textContent = codeContent.classList.contains('hidden') ? '⛶' : '−';
        });

        const copyBtn = document.createElement('button');
        copyBtn.classList.add('copy-btn-header');
        copyBtn.textContent = '⧉';
        copyBtn.addEventListener('click', () => {
            copyToClipboard(textToCopy, copyBtn);
        });

        header.appendChild(collapseBtn);
        header.appendChild(copyBtn);

        pre.insertBefore(header, codeContent);
    });
}

// Отправка запроса в агентскую систему
async function sendRequest(userPrompt) {
    if (isProcessing) return;

    isProcessing = true;
    sendButton.disabled = true;

    // Скрываем приветствие
    const welcomeMessageDiv = document.getElementById('welcome-message');
    welcomeMessageDiv.classList.add('hidden');

    // Добавляем сообщение пользователя
    addUserMessage(userPrompt);

    let responseContainer = null;

    try {
        // Шаг 1: POST на /run_pipeline
        updateConnectionStatus(false, 'Отправка...');

        const response = await fetch(PIPELINE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_prompt: userPrompt })
        });

        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }

        const data = await response.json();
        currentSessionId = data.session_id;

        // Создаем контейнер ответа
        responseContainer = createAgentResponseContainer(currentSessionId);

        // Шаг 2: Подключение к WebSocket
        const wsUrl = `${WS_BASE_URL}/${currentSessionId}`;
        updateConnectionStatus(true, 'Подключение...');

        currentWebSocket = new WebSocket(wsUrl);

        currentWebSocket.onopen = () => {
            updateConnectionStatus(true, 'Подключено');
        };

        currentWebSocket.onmessage = (messageEvent) => {
            try {
                const event = JSON.parse(messageEvent.data);

                // Добавляем событие в список статусов
                addStatusEvent(responseContainer.statusList, event);

                // Проверяем на финальный ответ
                if (event.event_type === 'pipeline_finished' && event.payload?.final_response) {
                    showFinalResponse(responseContainer, event.payload.final_response);
                    currentWebSocket.close();
                }

            } catch (e) {
                console.error('Ошибка парсинга события:', e);
            }
        };

        currentWebSocket.onclose = () => {
            updateConnectionStatus(false, 'Отключено');
            isProcessing = false;
            sendButton.disabled = false;
            currentWebSocket = null;
        };

        currentWebSocket.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            if (responseContainer) {
                showError(responseContainer, 'Ошибка WebSocket соединения');
            }
            updateConnectionStatus(false, 'Ошибка');
            isProcessing = false;
            sendButton.disabled = false;
        };

    } catch (error) {
        console.error('Ошибка запроса:', error);

        if (responseContainer) {
            showError(responseContainer, error.message);
        } else {
            // Если контейнер еще не создан, создаем его для отображения ошибки
            responseContainer = createAgentResponseContainer('error');
            showError(responseContainer, error.message);
        }

        updateConnectionStatus(false, 'Ошибка');
        isProcessing = false;
        sendButton.disabled = false;
    }
}

// Обработчик отправки
sendButton.addEventListener('click', () => {
    const userInput = input.value.trim();
    if (!userInput) return;

    input.value = '';
    sendRequest(userInput);
});

// Обработчик клавиш: Enter - отправить, Ctrl+Enter - новая строка
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (e.ctrlKey) {
            // Ctrl+Enter - добавляем новую строку
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + '\n' + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start + 1;
            e.preventDefault();
        } else {
            // Enter - отправляем сообщение
            e.preventDefault();
            const userInput = input.value.trim();
            if (userInput && !isProcessing) {
                input.value = '';
                sendRequest(userInput);
            }
        }
    }
});
