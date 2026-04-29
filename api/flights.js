// api/flights.js
const fetch = require('node-fetch');

// ⚠️ ЗАМЕНИ НА СВОИ ДАННЫЕ
const TELEGRAM_BOT_TOKEN = '7783850319:AAFofR20uzC4cMlgU2BWv952K0cKivbwREA';
const TELEGRAM_CHAT_ID = '-1003733046710';
const TELEGRAM_API = `https://api.telegram.org/bot${7783850319:AAFofR20uzC4cMlgU2BWv952K0cKivbwREA}`;

// ID сообщения, в котором хранятся данные
let messageId = null;

// Получаем первое сообщение из канала (где хранятся данные)
async function getDataMessage() {
    try {
        const response = await fetch(`${TELEGRAM_API}/getUpdates?limit=10`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            // Ищем сообщение из нашего канала с JSON
            for (const update of data.result.reverse()) {
                if (update.channel_post && 
                    update.channel_post.chat.id.toString() === TELEGRAM_CHAT_ID &&
                    update.channel_post.text) {
                    messageId = update.channel_post.message_id;
                    return update.channel_post;
                }
            }
        }
        return null;
    } catch (err) {
        console.error('Error getting data message:', err);
        return null;
    }
}

// Читаем данные из канала
async function readData() {
    try {
        const message = await getDataMessage();
        if (message && message.text) {
            try {
                return JSON.parse(message.text);
            } catch (e) {
                return { flights: [] };
            }
        }
        return { flights: [] };
    } catch (err) {
        console.error('Read error:', err);
        return { flights: [] };
    }
}

// Сохраняем данные в канал
async function writeData(data) {
    try {
        const jsonStr = JSON.stringify(data);
        
        if (messageId) {
            // Редактируем существующее сообщение
            await fetch(`${TELEGRAM_API}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: messageId,
                    text: jsonStr
                })
            });
        } else {
            // Отправляем новое сообщение
            const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: jsonStr
                })
            });
            const result = await resp.json();
            if (result.ok) {
                messageId = result.result.message_id;
            }
        }
        return true;
    } catch (err) {
        console.error('Write error:', err);
        return false;
    }
}

module.exports = async (req, res) => {
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { method } = req;

    try {
        // GET — получить все рейсы
        if (method === 'GET') {
            const data = await readData();
            return res.status(200).json(data);
        }

        // POST — добавить рейс
        if (method === 'POST') {
            const data = await readData();
            const flight = req.body;
            
            if (!flight.airline || !flight.flightNumber || !flight.destination) {
                return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
            }

            flight.id = Date.now().toString();
            flight.createdAt = new Date().toISOString();
            
            data.flights.push(flight);
            await writeData(data);
            
            return res.status(201).json({ success: true, flight });
        }

        // PUT — обновить рейс
        if (method === 'PUT') {
            const data = await readData();
            const { id, ...updates } = req.body;
            
            const index = data.flights.findIndex(f => f.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }

            data.flights[index] = { ...data.flights[index], ...updates };
            await writeData(data);
            
            return res.status(200).json({ success: true, flight: data.flights[index] });
        }

        // DELETE — удалить рейс
        if (method === 'DELETE') {
            const data = await readData();
            const { id } = req.query;
            
            const index = data.flights.findIndex(f => f.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }

            data.flights.splice(index, 1);
            await writeData(data);
            
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Метод не поддерживается' });
    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
};
