// Хранилище в памяти (живёт пока функция активна)
let flights = [];

module.exports = async (req, res) => {
    // Разрешаем запросы с любого сайта
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET — получить все рейсы
        if (req.method === 'GET') {
            return res.status(200).json({ flights });
        }

        // POST — добавить рейс
        if (req.method === 'POST') {
            const flight = req.body;
            
            // Проверяем обязательные поля
            if (!flight.flightNumber || !flight.destination) {
                return res.status(400).json({ error: 'Нужен номер рейса и направление' });
            }

            // Добавляем ID и время создания
            flight.id = Date.now().toString();
            flight.createdAt = new Date().toISOString();
            
            flights.push(flight);
            
            return res.status(200).json({ 
                success: true, 
                flight: flight,
                total: flights.length 
            });
        }

        // DELETE — удалить рейс
        if (req.method === 'DELETE') {
            const id = req.query.id;
            const before = flights.length;
            flights = flights.filter(f => f.id !== id);
            
            if (flights.length === before) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }
            
            return res.status(200).json({ success: true });
        }

        // PUT — обновить рейс
        if (req.method === 'PUT') {
            const updated = req.body;
            const index = flights.findIndex(f => f.id === updated.id);
            
            if (index === -1) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }
            
            flights[index] = { ...flights[index], ...updated };
            return res.status(200).json({ success: true, flight: flights[index] });
        }

        return res.status(405).json({ error: 'Метод не поддерживается' });

    } catch (err) {
        return res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
};
