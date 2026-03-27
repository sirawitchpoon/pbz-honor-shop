import mongoose from 'mongoose';

const MONGODB_CONNECTED = 1;
const MONGODB_DISCONNECTED = 0;

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      console.error('[MongoDB] MONGO_URI is not defined in environment variables');
      console.error('[MongoDB] Bot will continue running but database features will not work.');
      return;
    }

    if (mongoose.connection.readyState === MONGODB_CONNECTED) {
      console.log('[MongoDB] Already connected');
      return;
    }

    let normalizedURI = mongoURI;
    if (normalizedURI.includes('localhost')) {
      normalizedURI = normalizedURI.replace('localhost', '127.0.0.1');
    }

    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
      retryWrites: true,
    };

    mongoose.connection.on('error', (error) => {
      console.error('[MongoDB] Connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
      setTimeout(() => {
        if (mongoose.connection.readyState === MONGODB_DISCONNECTED) {
          console.log('[MongoDB] Attempting to reconnect...');
          connectDB().catch((error) => {
            console.error('[MongoDB] Reconnection failed:', error);
          });
        }
      }, 5000);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected');
    });

    console.log('[MongoDB] Connecting...');

    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        await mongoose.connect(normalizedURI, options);
        console.log('[MongoDB] Connected successfully');

        process.on('SIGINT', async () => {
          await mongoose.connection.close();
          console.log('[MongoDB] Connection closed through app termination');
          process.exit(0);
        });

        return;
      } catch (connectError) {
        lastError = connectError instanceof Error ? connectError : new Error(String(connectError));
        retries--;
        if (retries > 0) {
          console.warn(`[MongoDB] Connection attempt failed, retrying... (${retries} left)`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError || new Error('Failed to connect to MongoDB after retries');
  } catch (error) {
    console.error('[MongoDB] Error connecting:', error);
    mongoose.set('bufferCommands', false);
  }
};

export const isDBConnected = (): boolean => {
  return mongoose.connection.readyState === MONGODB_CONNECTED;
};
