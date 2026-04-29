// api/flights.js
const https = require('https');

// ⚠️ ЗАМЕНИ НА СВОИ ДАННЫЕ
const TELEGRAM_BOT_TOKEN = '7783850319:AAFofR20uzC4cMlgU2BWv952K0cKivbwREA';
const TELEGRAM_CHAT_ID = '-1003733046710'; // ВАЖНО: с минусом

// Храним ID сообщения в глобальной переменной
let messageId = null;

// Функция для запросов к Telegram API
function telegramRequest(method, body) {
    return new Promise((resolve, reject) => {
        const url = `/bot${TELEGRAM_BOT_TOKEN}/${method}`;
        const bodyStr = body ? JSON.stringify(body) : '';
        
        const options = {
            hostname: 'api.telegram.org',
            path: url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`Telegram ${method}:`, json.ok ? 'OK' : 'FAIL', json.ok ? '' : json.description);
                    if (json.ok) {
                        resolve(json.result);
                    } else {
                        reject(new Error(json.description || 'Unknown error'));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Network error: ${err.message}`));
        });

        req.write(bodyStr);
        req.end();
    });
}

// Отправить новое сообщение в канал
async function sendNewMessage(text) {
    try {
        const result = await telegramRequest('sendMessage', {
            chat_id: TELEGRAM_CHAT_ID,
            text: text,
            disable_notification: true
        });
        messageId = result.message_id;
        console.log('✅ Новое сообщение отправлено, ID:', messageId);
        return true;
    } catch (err) {
        console.error('❌ sendNewMessage error:', err.message);
        throw err;
    }
}

// Редактировать сообщение в канале
async function editMessage(text) {
    if (!messageId) {
        console.log('Нет messageId, отправляем новое сообщение');
        return await sendNewMessage(text);
    }
    
    try {
        await telegramRequest('editMessageText', {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: messageId,
            text: text
        });
        console.log('✅ Сообщение отредактировано, ID:', messageId);
        return true;
    } catch (err) {
        // Если не удалось отредактировать (например, сообщение удалено)
        console.log('⚠ Не удалось редактировать:', err.message);
        return await sendNewMessage(text);
    }
}

// Прочитать данные из канала
async function readFlights() {
    try {
        // Получаем последние обновления
        const updates = await telegramRequest('getUpdates', {
            offset: -1,
            limit: 10,
            timeout: 0,
            allowed_updates: ['channel_post']
        });

        // Ищем последнее сообщение из нашего канала
        if (updates && updates.length > 0) {
            for (let i = updates.length - 1; i >= 0; i--) {
                const update = updates[i];
                if (update.channel_post) {
                    const chatId = update.channel_post.chat.id;
                    // Проверяем, что это наш канал (Telegram возвращает ID без -100 для каналов в updates)
                    const expectedId = TELEGRAM_CHAT_ID.replace('-100', '');
                    if (chatId.toString() === expectedId || chatId.toString() === TELEGRAM_CHAT_ID) {
                        messageId = update.channel_post.message_id;
                        
                        if (update.channel_post.text) {
                            try {
                                const data = JSON.parse(update.channel_post.text);
                                if (data && Array.isArray(data.flights)) {
                                    console.log('📖 Прочитано рейсов:', data.flights.length);
                                    return data.flights;
                                }
                            } catch (e) {
                                console.log('⚠ Невалидный JSON в сообщении');
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Если данных нет, создаём пустой массив
        console.log('📝 Данные не найдены, создаём новые');
        const emptyData = JSON.stringify({ flights: [] });
        await sendNewMessage(emptyData);
        return [];
        
    } catch (err) {
        console.error('❌ readFlights error:', err.message);
        return [];
    }
}

// Сохранить данные в канал
async function saveFlights(flights) {
    try {
        const jsonStr = JSON.stringify({ flights: flights });
        
        // Пробуем редактировать
        if (messageId) {
            try {
                await editMessage(jsonStr);
                return true;
            } catch (err) {
                console.log('⚠ Не удалось сохранить через edit, пробуем новое сообщение');
            }
        }
        
        // Если редактирование не сработало - отправляем новое
        await sendNewMessage(jsonStr);
        return true;
        
    } catch (err) {
        console.error('❌ saveFlights error:', err.message);
        throw err;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { method } = req;

    try {
        // GET - получить рейсы
        if (method === 'GET') {
            const flights = await readFlights();
            return res.status(200).json({ flights: flights || [] });
        }

        // POST - добавить рейс
        if (method === 'POST') {
            const flights = await readFlights();
            const flight = req.body;
            
            // Проверка обязательных полей
            if (!flight.airline || !flight.flightNumber || !flight.destination) {
                return res.status(400).json({ 
                    error: 'Не все обязательные поля заполнены',
                    received: flight
                });
            }

            flight.id = Date.now().toString();
            flight.createdAt = new Date().toISOString();
            
            flights.push(flight);
            await saveFlights(flights);
            
            console.log('✅ Добавлен рейс:', flight.flightNumber, 'Всего:', flights.length);
            return res.status(200).json({ 
                success: true, 
                flight: flight,
                total: flights.length
            });
        }

        // PUT - обновить рейс
        if (method === 'PUT') {
            const flights = await readFlights();
            const updated = req.body;
            
            const index = flights.findIndex(f => f.id === updated.id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }

            flights[index] = { ...flights[index], ...updated };
            await saveFlights(flights);
            
            return res.status(200).json({ success: true, flight: flights[index] });
        }

        // DELETE - удалить рейс
        if (method === 'DELETE') {
            const flights = await readFlights();
            const { id } = req.query;
            
            const index = flights.findIndex(f => f.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }

            flights.splice(index, 1);
            await saveFlights(flights);
            
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Метод не поддерживается' });
        
    } catch (err) {
        console.error('❌ API Error:', err);
        return res.status(500).json({ 
            error: 'Ошибка сервера',
            message: err.message
        });
    }
};
