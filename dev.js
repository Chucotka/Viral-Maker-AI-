require('dotenv').config();
const app = require('./server/index.js');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Development server running on port ${PORT}`);
});
