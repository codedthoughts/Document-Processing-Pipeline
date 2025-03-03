const jwt = require('jsonwebtoken');
const User = require('../models/user');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user in database
        const user = await User.findById(decoded.userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Add user info to request
        req.user = {
            userId: user._id,
            email: user.email
        };
        
        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        res.status(401).json({ message: 'Please authenticate' });
    }
};

module.exports = auth;
