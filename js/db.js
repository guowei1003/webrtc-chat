class Database {
    constructor() {
        this.dbName = 'webrtcChatDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        try {
            this.db = await new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // 创建联系人存储
                    if (!db.objectStoreNames.contains('contacts')) {
                        const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
                        contactStore.createIndex('nickname', 'nickname', { unique: false });
                    }

                    // 创建消息存储
                    if (!db.objectStoreNames.contains('messages')) {
                        const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                        messageStore.createIndex('contactId', 'contactId', { unique: false });
                        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }

                    // 创建设置存储
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            });
            
            console.log('数据库初始化成功');
            return true;
        } catch (error) {
            console.error('数据库初始化失败:', error);
            throw new Error(`数据库初始化失败: ${error.message}`);
        }
    }

    async addContact(contact) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['contacts'], 'readwrite');
            const store = transaction.objectStore('contacts');
            const request = store.put(contact); // 使用put而不是add，这样可以更新现有联系人

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getContact(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['contacts'], 'readonly');
            const store = transaction.objectStore('contacts');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllContacts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['contacts'], 'readonly');
            const store = transaction.objectStore('contacts');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addMessage(message) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const request = store.add(message);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getMessages(contactId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('contactId');
            const request = index.getAll(contactId);

            request.onsuccess = () => {
                // 按时间戳排序
                const messages = request.result.sort((a, b) => a.timestamp - b.timestamp);
                resolve(messages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clearDatabase() {
        // 关闭当前数据库连接
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            
            request.onsuccess = () => {
                // 重新初始化数据库
                this.init()
                    .then(() => resolve())
                    .catch(reject);
            };
            
            request.onerror = () => reject(request.error);
            
            request.onblocked = () => {
                // 处理被阻塞的情况
                console.warn('数据库删除被阻塞，请关闭所有相关标签页后重试');
                reject(new Error('数据库删除被阻塞'));
            };
        });
    }

    async getNickname() {
        try {
            const store = this.db.transaction('settings', 'readonly').objectStore('settings');
            const request = store.get('nickname');
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result ? request.result.value : null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('获取昵称失败:', error);
            throw new Error(`获取昵称失败: ${error.message}`);
        }
    }

    async saveNickname(nickname) {
        try {
            const store = this.db.transaction('settings', 'readwrite').objectStore('settings');
            const request = store.put({ key: 'nickname', value: nickname });
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('保存昵称失败:', error);
            throw new Error(`保存昵称失败: ${error.message}`);
        }
    }
}

// 创建全局数据库实例
const db = new Database(); 