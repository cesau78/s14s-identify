const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger/swaggerConfig');
const auditContext = require('./middleware/auditContext');
const customerRoutes = require('./routes/customerRoutes');
const matchQualityRoutes = require('./routes/matchQualityRoutes');

const app = express();

app.use(express.json());
app.use(auditContext);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/customers', customerRoutes);
app.use('/match-quality', matchQualityRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
