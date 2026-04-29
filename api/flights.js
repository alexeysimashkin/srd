// api/flights.js
const https = require('https');

// ⚠️ ЗАМЕНИ НА СВОИ ДАННЫЕ
const TELEGRAM_BOT_TOKEN = '7783850319:AAFofR20uzC4cMlgU2BWv952K0cKivbwREA';
const TELEGRAM_CHAT_ID = '-1003733046710'; // ID канала с минусом

// Проверяем, что токен и chat_id заданы
if (TELEGRAM_BOT_TOKEN === 'ТВОЙ_ТОКЕН_БОТА' || TELEGRAM_CHAT_ID === '-100XXXXXXXXXX') {
    console.error('❌ ОШИБКА: Не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в api/flights.js');
}

// Храним ID последнего сообщения с данными в памяти сервера
let cachedMessageId = null;
let cachedFlights = [];

// Функция для запросов к Telegram API
function telegramRequest(method, body) {
    return new Promise((resolve, reject) => {
        const url = `/bot${TELEGRAM_BOT_TOKEN}/${method}`;
        const options = {
            hostname: 'api.telegram.org',
            path: url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.ok) {
                        resolve(json.result);
                    } else {
                        reject(new Error(`Telegram API error: ${json.description}`));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Request error: ${err.message}`));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Получить последнее сообщение из канала
async function getLastMessage() {
    try {
        // Получаем обновления только от канала
        let offset = -1;
        
        // Пробуем получить последние 5 сообщений
        const updates = await telegramRequest('getUpdates', {
            offset: offset,
            limit: 5,
            timeout: 0,
            allowed_updates: ['channel_post']
        });

        if (updates && updates.length > 0) {
            // Берём последнее сообщение
            const lastUpdate = updates[updates.length - 1];
            if (lastUpdate.channel_post && 
                lastUpdate.channel_post.chat.id.toString() === TELEGRAM_CHAT_ID.replace('-100', '')) {
                cachedMessageId = lastUpdate.channel_post.message_id;
                return lastUpdate.channel_post;
            }
        }

        // Если обновлений нет, пробуем отправить тестовое сообщение
        console.log('Нет обновлений, пробуем найти сообщения...');
        
        // Отправляем новое пустое сообщение, чтобы инициализировать
        const sentMsg = await telegramRequest('sendMessage', {
            chat_id: TELEGRAM_CHAT_ID,
            text: JSON.stringify({ flights: [] })
        });
        
        cachedMessageId = sentMsg.message_id;
        return sentMsg;
        
    } catch (err) {
        console.error('getLastMessage error:', err.message);
        throw err;
    }
}

// Прочитать данные
async function readFlights() {
    try {
        const message = await getLastMessage();
        
        if (message && message.text) {
            try {
                const data = JSON.parse(message.text);
                if (data && Array.isArray(data.flights)) {
                    cachedFlights = data.flights;
                    return data.flights;
                }
            } catch (e) {
                console.log('Невалидный JSON в сообщении, создаём новый');
            }
        }
        
        // Если данные битые, создаём новые
        await saveFlights([]);
        return [];
    } catch (err) {
        console.error('readFlights error:', err.message);
        // Возвращаем кэш если есть
        return cachedFlights || [];
    }
}

// Сохранить данные
async function saveFlights(flights) {
    try {
        const jsonStr = JSON.stringify({ flights: flights });
        
        if (cachedMessageId) {
            // Редактируем существующее сообщение
            try {
                await telegramRequest('editMessageText', {
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: cachedMessageId,
                    text: jsonStr
                });
                console.log('✅ Сообщение обновлено, message_id:', cachedMessageId);
                return true;
            } catch (editErr) {
                console.log('Не удалось редактировать:', editErr.message);
                cachedMessageId = null;
            }
        }
        
        // Отправляем новое сообщение
        const sent = await telegramRequest('sendMessage', {
            chat_id: TELEGRAM_CHAT_ID,
            text: jsonStr
        });
        
        cachedMessageId = sent.message_id;
        console.log('✅ Новое сообщение отправлено, message_id:', cachedMessageId);
        return true;
        
    } catch (err) {
        console.error('saveFlights error:', err.message);
        throw err;
    }
}

// API Handler для Vercel
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - получить все рейсы
        if (req.method === 'GET') {
            const flights = await readFlights();
            return res.status(200).json({ flights });
        }

        // POST - добавить рейс
        if (req.method === 'POST') {
            const flights = await readFlights();
            const flight = req.body;
            
            // Валидация
            if (!flight.airline || !flight.flightNumber || !flight.destination || !flight.iata) {
                return res.status(400).json({ 
                    error: 'Не все поля заполнены',
                    required: ['airline', 'flightNumber', 'destination', 'iata']
                });
            }

            // Добавляем ID и временную метку
            flight.id = Date.now().toString();
            flight.createdAt = new Date().toISOString();
            
            // Устанавливаем начальный статус
            if (!flight.status) {
                flight.status = 'scheduled';
                flight.statusText = 'По расписанию';
            }
            
            flights.push(flight);
            await saveFlights(flights);
            
            console.log('✅ Рейс добавлен:', flight.flightNumber);
            return res.status(200).json({ 
                success: true, 
                flight,
                message: 'Рейс добавлен'
            });
        }

        // PUT - обновить рейс
        if (req.method === 'PUT') {
            const flights = await readFlights();
            const updatedFlight = req.body;
            const id = updatedFlight.id;
            
            if (!id) {
                return res.status(400).json({ error: 'Не указан ID рейса' });
            }
            
            const index = flights.findIndex(f => f.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }
            
            flights[index] = { ...flights[index], ...updatedFlight };
            await saveFlights(flights);
            
            console.log('✅ Рейс обновлён:', flights[index].flightNumber);
            return res.status(200).json({ 
                success: true, 
                flight: flights[index],
                message: 'Рейс обновлён'
            });
        }

        // DELETE - удалить рейс
        if (req.method === 'DELETE') {
            const flights = await readFlights();
            const id = req.query.id;
            
            if (!id) {
                return res.status(400).json({ error: 'Не указан ID рейса' });
            }
            
            const index = flights.findIndex(f => f.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }
            
            const deleted = flights.splice(index, 1)[0];
            await saveFlights(flights);
            
            console.log('🗑 Рейс удалён:', deleted.flightNumber);
            return res.status(200).json({ 
                success: true,
                message: 'Рейс удалён'
            });
        }

        return res.status(405).json({ error: 'Метод не поддерживается' });
        
    } catch (err) {
        console.error('❌ API Error:', err.message);
        return res.status(500).json({ 
            error: 'Ошибка сервера',
            details: err.message 
        });
    }
};
