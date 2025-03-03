const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Debug function for mongoose operations
const debugMongoose = function(operation) {
    console.log(`\n🔍 Mongoose ${operation}:`);
    console.log('Document:', this.toObject());
};

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    tokens: [{
        token: {
            type: String,
            required: true
        }
    }]
}, {
    timestamps: true
});

// Debug hooks
userSchema.pre('save', function(next) {
    debugMongoose.call(this, 'Before Save');
    next();
});

userSchema.post('save', function(doc) {
    debugMongoose.call(doc, 'After Save');
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    try {
        console.log('\n🔐 Password Processing:');
        const user = this;
        
        if (user.isModified('password')) {
            console.log('Password was modified, hashing...');
            user.password = await bcrypt.hash(user.password, 10);
            console.log('Password hashed successfully');
        } else {
            console.log('Password not modified, skipping hash');
        }
        
        next();
    } catch (error) {
        console.error('❌ Error in password hashing:', error);
        next(error);
    }
});

// Generate auth token
userSchema.methods.generateAuthToken = async function() {
    try {
        console.log('\n🎫 Generating Auth Token:');
        const user = this;
        
        console.log('Creating JWT token...');
        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        console.log('JWT token created');

        console.log('Adding token to user tokens array...');
        user.tokens = user.tokens || [];
        user.tokens.push({ token });
        
        console.log('Saving user with new token...');
        await user.save();
        console.log('User saved with new token');

        return token;
    } catch (error) {
        console.error('❌ Error generating auth token:', error);
        throw error;
    }
};

// Find user by credentials
userSchema.statics.findByCredentials = async (email, password) => {
    try {
        console.log('\n🔍 Finding User by Credentials:');
        console.log('Looking up user by email:', email);
        
        const user = await User.findOne({ email });
        if (!user) {
            console.log('❌ User not found');
            throw new Error('Invalid credentials');
        }
        console.log('✅ User found');

        console.log('Verifying password...');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('❌ Password mismatch');
            throw new Error('Invalid credentials');
        }
        console.log('✅ Password verified');

        return user;
    } catch (error) {
        console.error('❌ Error in findByCredentials:', error);
        throw error;
    }
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
    const user = this;
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.tokens;

    return userObject;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
