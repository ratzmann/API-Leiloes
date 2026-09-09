const { Router } = require('express');
const authController = require('../controllers/authController');

const router = Router();

router.post('/registrar', authController.registrar);
router.post('/login', authController.login);

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

module.exports = router;
