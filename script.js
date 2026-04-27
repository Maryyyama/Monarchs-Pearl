/* ==========================================================================
   Monarch's Pearl — интерактивная печатная машинка
   Логика: отслеживание нажатий клавиш, создание жемчужных пузырьков,
   управление звуком, счётчик, защита от спама.
   ========================================================================== */

(function() {
    'use strict';

    // ==================== КОНФИГУРАЦИЯ ====================
    const CONFIG = {
        MAX_PEARLS: 20,               // максимальное количество одновременно видимых пузырьков
        FLOAT_DISTANCE: 300,          // пикселей, на которые поднимается пузырёк
        ANIMATION_DURATION: 2000,     // длительность анимации подъёма и исчезновения (мс)
        APPEAR_DURATION: 500,         // длительность появления (мс)
        SOUND_FREQUENCY: 200,         // частота звука шёлка/бархата (низкая, мягкая) (Гц)
        SOUND_DURATION: 0.3,          // длительность звука (сек) – более плавное затухание
        VOLUME: 0.2,                  // громкость (0–1) – тише, деликатнее
        RANDOM_X_RANGE: { min: 0.2, max: 0.8 }, // диапазон случайной позиции по X (доли ширины)
        RANDOM_Y_RANGE: { min: 0.6, max: 0.9 }  // диапазон случайной позиции по Y (доли высоты)
    };

    // ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
    let pearlCount = 0;               // счётчик всех созданных жемчужин
    let activePearls = 0;             // количество активных (видимых) жемчужин
    let soundEnabled = true;          // флаг включения звука
    let audioContext = null;          // контекст Web Audio API
    let textureSound = null;          // экземпляр TextureSound для бархатного звука
    let canvas = null;                // контейнер для пузырьков
    let counterElement = null;        // элемент счётчика
    let soundToggle = null;           // кнопка переключения звука
    let soundLabel = null;            // текст звука внутри кнопки

    // ==================== КЛАСС TEXTURE SOUND ====================
    class TextureSound {
        constructor() {
            this.audioCtx = null;
        }

        _ensureAudioContext() {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        }

        playSilk() {
            this._generateSound(0.05, 0.2, 3000, 0.1); // Более легкий, «высокий» звук
        }

        playVelvet() {
            this._generateSound(0.1, 0.4, 800, 0.3); // Глубокий, мягкий звук
        }

        _generateSound(attack, duration, filterFreq, volume) {
            this._ensureAudioContext();
            const ctx = this.audioCtx;
            
            // 1. Создаем источник шума (имитация трения волокон)
            const bufferSize = ctx.sampleRate * duration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < bufferSize; i++) {
                // Генерация мягкого шума
                data[i] = Math.random() * 2 - 1;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            // 2. Фильтр (Low Pass) — убирает резкость, оставляя «глубину»
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            // Добавляем небольшую случайность к частоте фильтра для натуральности
            filter.frequency.value = filterFreq + (Math.random() * 200 - 100);
            filter.Q.value = 1;

            // 3. Огибающая громкости (Gain) — убирает щелчок при нажатии
            const gainNode = ctx.createGain();
            const now = ctx.currentTime;
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + attack); // Плавное появление
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Плавное затухание

            // Соединяем узлы
            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(ctx.destination);

            noise.start();
            noise.stop(now + duration);
        }
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // Получаем DOM-элементы
        canvas = document.getElementById('canvas');
        counterElement = document.getElementById('counter');
        soundToggle = document.getElementById('soundToggle');
        soundLabel = soundToggle.querySelector('.sound-label');
        const soundOnIcon = soundToggle.querySelector('.sound-on');
        const soundOffIcon = soundToggle.querySelector('.sound-off');

        // Отладочный вывод
        console.log('Иконки звука:', soundOnIcon, soundOffIcon);

        // Сохраняем ссылки на иконки в объекте soundToggle для удобства
        soundToggle.soundOnIcon = soundOnIcon;
        soundToggle.soundOffIcon = soundOffIcon;

        // Инициализируем Web Audio API (лениво, при первом щелчке)
        initAudioContext();
        // Создаём экземпляр TextureSound для бархатного звука
        textureSound = new TextureSound();

        // Вешаем обработчики событий
        window.addEventListener('keydown', handleKeyDown);
        soundToggle.addEventListener('click', toggleSound);

        // Обновляем счётчик
        updateCounter();

        // Выводим приветственное сообщение в консоль
        console.log(
            '%c👑 Monarch\'s Pearl готов к работе.\n' +
            'Нажмите любую клавишу, чтобы создать золотую жемчужину.',
            'color: #C9A87C; font-size: 14px; font-family: monospace;'
        );
    }

    // ==================== ОБРАБОТКА НАЖАТИЙ КЛАВИШ ====================
    function handleKeyDown(event) {
        // Игнорируем служебные клавиши (Shift, Ctrl, Alt, Meta, CapsLock, etc.)
        if (event.ctrlKey || event.altKey || event.metaKey ||
            ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab', 'Enter'].includes(event.key)) {
            return;
        }

        // Получаем символ для отображения
        let displayChar = getDisplayCharacter(event.key, event.code);

        // Создаём жемчужину
        createPearl(displayChar);

        // Воспроизводим бархатный звук, если включён
        if (soundEnabled && textureSound) {
            textureSound.playVelvet();
        }

        // Предотвращаем стандартное поведение (например, прокрутку пробелом)
        if (event.key === ' ' || event.key.length === 1) {
            event.preventDefault();
        }
    }

    // Определяем, какой символ показывать
    function getDisplayCharacter(key, code) {
        // Пробел
        if (key === ' ') {
            return '␣';
        }
        // Если key — одна буква (латиница или кириллица), оставляем как есть
        if (key.length === 1 && key.match(/[\wа-яА-ЯёЁ]/)) {
            return key.toUpperCase();
        }
        // Для цифр и прочих печатных символов
        if (key.length === 1 && key.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)) {
            return key;
        }
        // Для стрелок и прочих клавиш с длинными именами — возвращаем сокращение
        if (code.startsWith('Arrow')) {
            return code.replace('Arrow', '');
        }
        // По умолчанию возвращаем первую букву названия клавиши
        return key.charAt(0).toUpperCase();
    }

    // ==================== СОЗДАНИЕ ЖЕМЧУЖИНЫ ====================
    function createPearl(character) {
        // Проверяем лимит активных пузырьков
        if (activePearls >= CONFIG.MAX_PEARLS) {
            console.warn(`Достигнут лимит ${CONFIG.MAX_PEARLS} одновременных жемчужин. Новая не создана.`);
            return;
        }

        // Создаём элемент жемчужины
        const pearl = document.createElement('div');
        pearl.className = 'pearl';
        pearl.textContent = character;

        // Если символ — цифра или специальный символ, добавляем класс для золотой жемчужины
        // Также буква А (русская) должна быть золотой жемчужиной
        if (character.match(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/) || character === '␣' || character === 'А' || character === 'A') {
            pearl.classList.add('golden-pearl');
        }

        // Случайная позиция в пределах canvas (в процентах от его размеров)
        const canvasRect = canvas.getBoundingClientRect();
        const randX = CONFIG.RANDOM_X_RANGE.min + 
                     Math.random() * (CONFIG.RANDOM_X_RANGE.max - CONFIG.RANDOM_X_RANGE.min);
        const randY = CONFIG.RANDOM_Y_RANGE.min + 
                     Math.random() * (CONFIG.RANDOM_Y_RANGE.max - CONFIG.RANDOM_Y_RANGE.min);

        const posX = canvasRect.width * randX;
        const posY = canvasRect.height * randY;

        // Устанавливаем позицию
        pearl.style.left = `${posX}px`;
        pearl.style.top = `${posY}px`;

        // CSS-переменные для анимации (начальная позиция для подъёма)
        pearl.style.setProperty('--startY', `${posY}px`);

        // Добавляем на canvas
        canvas.appendChild(pearl);

        // Увеличиваем счётчики
        pearlCount++;
        activePearls++;
        updateCounter();

        // Удаляем жемчужину после завершения анимации
        setTimeout(() => {
            if (pearl.parentNode) {
                pearl.parentNode.removeChild(pearl);
                activePearls--;
            }
        }, CONFIG.APPEAR_DURATION + CONFIG.ANIMATION_DURATION);
    }

    // ==================== СЧЁТЧИК ====================
    function updateCounter() {
        if (counterElement) {
            counterElement.textContent = pearlCount;
        }
    }

    // ==================== ЗВУК ====================
    function initAudioContext() {
        // Создаём AudioContext только при первом использовании (совместимость с браузерами)
        if (!audioContext && window.AudioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTypewriterSound() {
        if (!audioContext) {
            initAudioContext();
            if (!audioContext) return; // если Web Audio не поддерживается
        }

        // Создаём осциллятор и усилитель
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Настраиваем звук шёлка/бархата – низкая частота, плавная огибающая
        oscillator.frequency.setValueAtTime(CONFIG.SOUND_FREQUENCY, audioContext.currentTime);
        oscillator.type = 'sine';

        // Огибающая громкости: мягкий атак, плавный спад
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.VOLUME, audioContext.currentTime + 0.05); // более медленный атак
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + CONFIG.SOUND_DURATION);

        // Запускаем и останавливаем
        oscillator.start();
        oscillator.stop(audioContext.currentTime + CONFIG.SOUND_DURATION);

        // Восстанавливаем контекст, если он был приостановлен (автополитика браузеров)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    // ==================== ПЕРЕКЛЮЧЕНИЕ ЗВУКА ====================
    function toggleSound() {
        soundEnabled = !soundEnabled;
        console.log('Переключение звука, soundEnabled=', soundEnabled);

        // Меняем внешний вид кнопки
        if (soundEnabled) {
            soundLabel.textContent = 'Звук включён';
            soundToggle.classList.remove('muted');
            if (soundToggle.soundOnIcon) soundToggle.soundOnIcon.classList.remove('hidden');
            if (soundToggle.soundOffIcon) soundToggle.soundOffIcon.classList.add('hidden');
        } else {
            soundLabel.textContent = 'Звук выключен';
            soundToggle.classList.add('muted');
            if (soundToggle.soundOnIcon) soundToggle.soundOnIcon.classList.add('hidden');
            if (soundToggle.soundOffIcon) soundToggle.soundOffIcon.classList.remove('hidden');
        }

        // Воспроизводим тестовый щелчок при включении
        if (soundEnabled && textureSound) {
            textureSound.playVelvet();
        }
    }

    // ==================== УТИЛИТЫ ====================
    // Экспортируем основные функции в глобальную область видимости для отладки
    window.MonarchsPearl = {
        createPearl,
        toggleSound,
        getDisplayCharacter,
        config: CONFIG,
        stats: () => ({ pearlCount, activePearls, soundEnabled })
    };

})();