class App {
    constructor() {
        this.currentNickname = '';
        this.currentContactId = null;
        this.fileReceiveBuffer = {};
        this.nickname = null;
        
        // 初始化数据库
        this.init();
        
        // 初始化UI元素
        this.initUIElements();
        
        // 设置事件监听
        this.setupEventListeners();
    }

    async init() {
        try {
            await db.init();
            
            // 获取保存的昵称
            this.nickname = await db.getNickname();
            if (!this.nickname) {
                // 如果没有保存的昵称，生成一个新的
                this.nickname = this.generateRandomNickname();
                // 保存新生成的昵称
                await db.saveNickname(this.nickname);
            }
            
            // 显示昵称
            this.updateNicknameDisplay();
            
            this.loadContacts();
        } catch (error) {
            console.error('初始化失败:', error);
            alert(`初始化失败: ${error.message}`);
        }
    }

    initUIElements() {
        // 导航元素
        this.navItems = document.querySelectorAll('.nav-item');
        
        // 主页元素
        this.nicknameElement = document.getElementById('currentNickname');
        this.changeNicknameBtn = document.getElementById('changeNickname');
        this.generateCodeBtn = document.getElementById('generateCode');
        this.connectionCodeArea = document.getElementById('connectionCode');
        this.copyCodeBtn = document.getElementById('copyCode');
        this.peerCodeArea = document.getElementById('peerCode');
        this.connectBtn = document.getElementById('connect');
        
        // 聊天页面元素
        this.contactList = document.getElementById('contactList');
        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendMessageBtn = document.getElementById('sendMessage');
        this.fileInput = document.getElementById('fileInput');
        this.attachFileBtn = document.getElementById('attachFile');
        
        // 设置页面元素
        this.clearCacheBtn = document.getElementById('clearCache');
    }

    setupEventListeners() {
        // 导航事件
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(item.dataset.page);
            });
        });

        // 主页事件
        this.changeNicknameBtn.addEventListener('click', async () => {
            const newNickname = this.generateRandomNickname();
            await this.setNickname(newNickname);
        });
        this.generateCodeBtn.addEventListener('click', () => this.generateConnectionCode());
        this.copyCodeBtn.addEventListener('click', () => this.copyConnectionCode());
        this.connectBtn.addEventListener('click', () => this.connectToPeer());

        // 添加应答码输入框事件
        this.answerInput = document.createElement('textarea');
        this.answerInput.className = 'answer-input';
        this.answerInput.placeholder = '在这里输入对方的应答码...';
        this.answerInput.style.display = 'none';
        this.connectionCodeArea.parentNode.appendChild(this.answerInput);

        this.submitAnswerBtn = document.createElement('button');
        this.submitAnswerBtn.className = 'submit-answer-btn';
        this.submitAnswerBtn.textContent = '提交应答码';
        this.submitAnswerBtn.style.display = 'none';
        this.connectionCodeArea.parentNode.appendChild(this.submitAnswerBtn);

        this.submitAnswerBtn.addEventListener('click', async () => {
            const answerString = this.answerInput.value.trim();
            if (!answerString) {
                alert('请输入应答码');
                return;
            }
            await this.handleAnswer(answerString);
        });

        // 聊天页面事件
        this.sendMessageBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.attachFileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // 设置页面事件
        this.clearCacheBtn.addEventListener('click', () => this.clearCache());

        // WebRTC事件
        webrtc.setOnMessage((message) => this.handleIncomingMessage(message));
        webrtc.setOnConnectionStateChange((state) => this.handleConnectionStateChange(state));

        // 联系人切换
        this.contactsToggle = document.getElementById('contactsToggle');
        this.closeContacts = document.querySelector('.close-contacts');
        this.contactsPanel = document.querySelector('.contacts');

        if (this.contactsToggle) {
            this.contactsToggle.addEventListener('click', () => {
                this.contactsPanel.classList.add('active');
            });
        }

        if (this.closeContacts) {
            this.closeContacts.addEventListener('click', () => {
                this.contactsPanel.classList.remove('active');
            });
        }

        // 点击联系人后在移动端自动关闭联系人列表
        document.querySelectorAll('.contact-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    this.contactsPanel.classList.remove('active');
                }
            });
        });
    }

    switchPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
        
        this.navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageId) {
                item.classList.add('active');
            }
        });
    }

    generateRandomNickname() {
        const adjectives = ['快乐的', '聪明的', '可爱的', '友善的', '勇敢的'];
        const nouns = ['小猫', '小狗', '小兔', '小熊', '小鸟'];
        const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${randomAdjective}${randomNoun}${Math.floor(Math.random() * 100)}`;
    }

    updateNicknameDisplay() {
        if (this.nicknameElement) {
            this.nicknameElement.textContent = this.nickname;
        }
    }

    async setNickname(newNickname) {
        try {
            this.nickname = newNickname;
            await db.saveNickname(newNickname);
            this.updateNicknameDisplay();
        } catch (error) {
            console.error('设置昵称失败:', error);
            alert(`设置昵称失败: ${error.message}`);
        }
    }

    async generateConnectionCode() {
        try {
            // 移除先前的提示（如果存在）
            const existingPrompt = document.querySelector('.answer-prompt');
            if (existingPrompt) {
                existingPrompt.remove();
            }
            
            // 移除先前的应答码容器（如果存在）
            const existingAnswerContainer = document.querySelector('.answer-code-container');
            if (existingAnswerContainer) {
                existingAnswerContainer.remove();
            }
            
            // 使用保存的昵称
            const connectionCode = await webrtc.createOffer({
                nickname: this.nickname
            });
            this.connectionCodeArea.value = connectionCode;

            // 自动复制连接码到剪贴板
            this.copyToClipboard(connectionCode, this.copyCodeBtn);
            
            // 显示提示
            this.showToast('连接码已自动复制到剪贴板');

            // 显示应答码输入区域
            this.answerInput.style.display = 'block';
            this.submitAnswerBtn.style.display = 'block';

            // 等待对方的应答提示
            const answerPrompt = document.createElement('div');
            answerPrompt.className = 'answer-prompt';
            answerPrompt.textContent = '请等待对方接受连接并将应答码粘贴到下方输入框...';
            this.connectionCodeArea.parentNode.appendChild(answerPrompt);

            return connectionCode;
        } catch (error) {
            console.error('生成连接码失败:', error);
            throw new Error(`生成连接码失败: ${error.message}`);
        }
    }

    copyConnectionCode() {
        if (!this.connectionCodeArea.value) {
            alert('没有可复制的连接码');
            return;
        }

        this.copyToClipboard(this.connectionCodeArea.value, this.copyCodeBtn);
    }

    async connectToPeer() {
        try {
            const connectionString = this.peerCodeArea.value.trim();
            if (!connectionString) {
                alert('请输入连接码');
                return;
            }

            // 禁用连接按钮
            this.connectBtn.disabled = true;
            this.connectBtn.textContent = '连接中...';

            // 解析并验证连接码
            const connectionData = webrtc.parseConnectionString(connectionString);
            
            // 显示连接确认对话框
            const peerInfo = connectionData.contactInfo;
            const confirmMessage = `是否连接到以下用户？\n\n昵称: ${peerInfo.nickname}`;
            
            if (!confirm(confirmMessage)) {
                throw new Error('用户取消连接');
            }

            // 移除先前的应答码容器（如果存在）
            const existingAnswerContainer = document.querySelector('.answer-code-container');
            if (existingAnswerContainer) {
                existingAnswerContainer.remove();
            }

            // 接受连接请求并生成应答
            const answer = await webrtc.acceptOffer(connectionData);

            // 生成应答字符串
            const answerData = {
                version: '1.0',
                type: 'webrtc-answer',
                answer: answer.answer,
                candidates: answer.candidates,
                contactInfo: {
                    nickname: this.nickname
                },
                timestamp: Date.now()
            };

            // 编码应答数据
            const jsonString = JSON.stringify(answerData);
            const base64String = webrtc.encodeString(jsonString);
            const checksum = webrtc.calculateChecksum(base64String);
            const answerString = `${base64String}.${checksum}`;

            // 显示应答码
            const answerAreaContainer = document.createElement('div');
            answerAreaContainer.className = 'answer-code-container';

            const answerHeader = document.createElement('div');
            answerHeader.className = 'answer-code-header';
            answerHeader.innerHTML = '<i class="fas fa-check-circle"></i> 应答码已生成';
            
            const answerArea = document.createElement('textarea');
            answerArea.className = 'answer-code';
            answerArea.value = answerString;
            answerArea.readOnly = true;

            const copyButton = document.createElement('button');
            copyButton.className = 'copy-answer-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i> 复制应答码';
            copyButton.addEventListener('click', () => {
                this.copyToClipboard(answerString, copyButton);
            });

            answerAreaContainer.appendChild(answerHeader);
            answerAreaContainer.appendChild(answerArea);
            answerAreaContainer.appendChild(copyButton);
            
            this.peerCodeArea.parentNode.appendChild(answerAreaContainer);

            // 自动复制到剪贴板
            this.copyToClipboard(answerString, copyButton);

            // 显示成功提示
            this.showToast('应答码已自动复制到剪贴板');

            // 保存联系人信息
            const contact = {
                id: connectionData.contactInfo.nickname,
                nickname: connectionData.contactInfo.nickname,
                lastConnected: Date.now(),
                connectionData: connectionData
            };
            await db.addContact(contact);
            this.loadContacts();

            // 切换到聊天页面
            this.switchPage('chat');
            this.selectContact(contact.id);

            // 清空连接码输入框
            this.peerCodeArea.value = '';

        } catch (error) {
            console.error('连接失败:', error);
            alert('连接失败: ' + error.message);
        } finally {
            // 恢复按钮状态
            this.connectBtn.disabled = false;
            this.connectBtn.textContent = '连接';
        }
    }

    async handleAnswer(answerString) {
        try {
            // 解析应答字符串
            const [base64String, checksum] = answerString.split('.');
            
            if (!base64String || !checksum) {
                throw new Error('应答码格式错误');
            }

            if (webrtc.calculateChecksum(base64String) !== checksum) {
                throw new Error('应答码校验失败');
            }

            // 解码应答数据
            const jsonString = webrtc.decodeString(base64String);
            const answerData = JSON.parse(jsonString);

            if (answerData.version !== '1.0' || answerData.type !== 'webrtc-answer') {
                throw new Error('不支持的应答码格式');
            }

            // 处理应答
            await webrtc.handleAnswer(answerData.answer);

            // 添加ICE候选者
            for (const candidate of answerData.candidates) {
                if (candidate) {
                    await webrtc.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }

            // 等待数据通道就绪
            await webrtc.waitForDataChannel();

            // 保存联系人信息
            const contact = {
                id: answerData.contactInfo.nickname,
                nickname: answerData.contactInfo.nickname,
                lastConnected: Date.now()
            };
            await db.addContact(contact);
            this.loadContacts();

            // 切换到聊天页面
            this.switchPage('chat');
            this.selectContact(contact.id);

            // 显示连接成功提示
            alert('连接成功！');

        } catch (error) {
            console.error('处理应答失败:', error);
            alert('处理应答失败: ' + error.message);
        }
    }

    async loadContacts() {
        try {
            const contacts = await db.getAllContacts();
            this.contactList.innerHTML = '';
            
            // 空联系人状态显示控制
            const emptyContactList = document.getElementById('emptyContactList');
            if (contacts.length === 0) {
                if (emptyContactList) emptyContactList.style.display = 'flex';
            } else {
                if (emptyContactList) emptyContactList.style.display = 'none';
            }
            
            contacts.forEach(contact => {
                const li = document.createElement('li');
                li.className = 'contact-item';
                
                // 联系人名称
                const nameSpan = document.createElement('span');
                nameSpan.className = 'contact-item-name';
                nameSpan.textContent = contact.nickname;
                li.appendChild(nameSpan);
                
                // 联系人操作区域
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'contact-item-actions';
                
                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-contact';
                deleteBtn.title = '删除联系人';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止冒泡，避免触发选中联系人
                    this.showDeleteConfirm(contact.id, contact.nickname);
                });
                actionsDiv.appendChild(deleteBtn);
                
                li.appendChild(actionsDiv);
                
                // 点击整个联系人项目选中联系人
                li.addEventListener('click', () => this.selectContact(contact.id));
                this.contactList.appendChild(li);

                // 在移动端点击联系人后自动关闭联系人面板
                if (window.innerWidth <= 768) {
                    li.addEventListener('click', () => {
                        if (this.contactsPanel) {
                            this.contactsPanel.classList.remove('active');
                        }
                    });
                }
            });
        } catch (error) {
            console.error('加载联系人失败:', error);
        }
    }

    async selectContact(contactId) {
        this.currentContactId = contactId;
        
        // 更新UI
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.textContent === contactId) {
                item.classList.add('active');
            }
        });

        // 加载消息历史
        await this.loadMessages(contactId);
    }

    async loadMessages(contactId) {
        try {
            const messages = await db.getMessages(contactId);
            this.messagesContainer.innerHTML = '';
            
            messages.forEach(message => this.displayMessage(message));
            
            // 滚动到底部
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        } catch (error) {
            console.error('加载消息失败:', error);
        }
    }

    async sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text || !this.currentContactId) return;

        const message = {
            type: 'text',
            contactId: this.currentContactId,
            content: text,
            timestamp: Date.now(),
            sent: true
        };

        try {
            // 检查连接状态
            const connectionState = webrtc.getConnectionState();
            console.log('当前连接状态:', connectionState);

            if (connectionState.dataChannelState !== 'open') {
                throw new Error('数据通道未就绪');
            }

            // 发送消息
            await webrtc.sendMessage(message);
            
            // 保存到本地数据库
            await db.addMessage(message);
            
            // 显示消息
            this.displayMessage(message);
            
            // 清空输入框
            this.messageInput.value = '';
            
            // 滚动到底部
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        } catch (error) {
            console.error('发送消息失败:', error);
            alert('发送消息失败: ' + error.message);
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            await webrtc.sendFile(file);
            
            const message = {
                type: 'file',
                contactId: this.currentContactId,
                content: {
                    name: file.name,
                    size: file.size,
                    type: file.type
                },
                timestamp: Date.now(),
                sent: true
            };

            await db.addMessage(message);
            this.displayMessage(message);
        } catch (error) {
            console.error('发送文件失败:', error);
            alert('发送文件失败，请重试');
        }

        // 清除文件选择
        this.fileInput.value = '';
    }

    async handleIncomingMessage(message) {
        if (message.type === 'file') {
            // 初始化文件接收缓冲区
            this.fileReceiveBuffer[message.name] = {
                chunks: [],
                total: message.size
            };
        } else if (message.type === 'chunk') {
            // 接收文件块
            const fileBuffer = this.fileReceiveBuffer[message.name];
            if (fileBuffer) {
                fileBuffer.chunks[message.index] = message.data;
                
                // 检查是否接收完成
                if (fileBuffer.chunks.length === message.total) {
                    const blob = new Blob(fileBuffer.chunks.map(chunk => {
                        const binary = atob(chunk);
                        const array = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            array[i] = binary.charCodeAt(i);
                        }
                        return array;
                    }));

                    // 创建下载链接
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = message.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    // 清理缓冲区
                    delete this.fileReceiveBuffer[message.name];
                }
            }
        } else {
            // 处理文本消息
            message.sent = false;
            await db.addMessage(message);
            this.displayMessage(message);
        }
    }

    displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sent ? 'sent' : 'received'}`;

        if (message.type === 'text') {
            messageElement.textContent = message.content;
        } else if (message.type === 'file') {
            messageElement.innerHTML = `
                <div class="file-message">
                    <span class="file-icon">📎</span>
                    <span class="file-name">${message.content.name}</span>
                    <span class="file-size">${this.formatFileSize(message.content.size)}</span>
                </div>
            `;
        }

        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }

    handleConnectionStateChange(state) {
        console.log('连接状态变化:', state);
        
        // 更新UI显示连接状态
        const statusElement = document.createElement('div');
        statusElement.className = `connection-status ${state}`;
        statusElement.textContent = `连接状态: ${this.getConnectionStateText(state)}`;
        
        const existingStatus = document.querySelector('.connection-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        this.messagesContainer.appendChild(statusElement);

        if (state === 'disconnected' || state === 'failed') {
            alert('连接已断开，请尝试重新连接');
        }
    }

    getConnectionStateText(state) {
        const stateMap = {
            'new': '新建连接',
            'checking': '检查中',
            'connected': '已连接',
            'completed': '连接完成',
            'disconnected': '已断开',
            'failed': '连接失败',
            'closed': '已关闭'
        };
        return stateMap[state] || state;
    }

    async clearCache() {
        if (confirm('确定要清除所有数据吗？这将删除所有聊天记录和联系人信息。')) {
            try {
                await db.clearDatabase();
                location.reload();
            } catch (error) {
                console.error('清除缓存失败:', error);
                alert('清除缓存失败，请重试');
            }
        }
    }

    // 添加删除确认对话框方法
    showDeleteConfirm(contactId, contactName) {
        // 检查是否已存在确认对话框，如果有则先移除
        const existingConfirm = document.querySelector('.delete-confirm');
        if (existingConfirm) {
            existingConfirm.remove();
        }
        
        // 创建确认对话框
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'delete-confirm';
        confirmDialog.innerHTML = `
            <div class="delete-confirm-content">
                <p>确定要删除联系人"${contactName}"吗？这将同时断开与该联系人的连接。</p>
                <div class="delete-confirm-actions">
                    <button class="cancel-delete">取消</button>
                    <button class="confirm-delete">删除</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(confirmDialog);
        
        // 绑定取消按钮事件
        confirmDialog.querySelector('.cancel-delete').addEventListener('click', () => {
            confirmDialog.remove();
        });
        
        // 绑定确认按钮事件
        confirmDialog.querySelector('.confirm-delete').addEventListener('click', async () => {
            await this.deleteContact(contactId);
            confirmDialog.remove();
        });
    }

    // 删除联系人方法
    async deleteContact(contactId) {
        try {
            // 从IndexedDB中删除联系人
            await this.db.deleteContact(contactId);
            
            // 如果删除的是当前选中的联系人，清空聊天区域
            if (this.currentContact && this.currentContact.id === contactId) {
                this.currentContact = null;
                this.clearChatArea();
                document.querySelector('.chat-container').classList.add('empty');
                document.getElementById('chat-title').textContent = '选择联系人开始聊天';
            }
            
            // 断开与该联系人的WebRTC连接
            if (this.peerConnections[contactId]) {
                if (this.peerConnections[contactId].connection) {
                    this.peerConnections[contactId].connection.close();
                }
                delete this.peerConnections[contactId];
            }
            
            // 更新UI，移除该联系人
            this.loadContacts();
            
            // 显示成功提示
            this.showToast('联系人已成功删除');
        } catch (error) {
            console.error('删除联系人失败:', error);
            this.showToast('删除联系人失败，请重试');
        }
    }

    // 清空聊天区域
    clearChatArea() {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        // 显示空聊天提示
        const emptyChat = document.createElement('div');
        emptyChat.className = 'empty-chat-message';
        emptyChat.textContent = '选择联系人开始聊天';
        messagesContainer.appendChild(emptyChat);
    }

    // 显示Toast提示
    showToast(message) {
        // 删除现有的toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // 创建新的toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 自动移除toast
        setTimeout(function() {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 1500);
    }

    // 复制文本到剪贴板
    copyToClipboard(text, button) {
        // 先尝试使用现代API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    if (button) {
                        const originalText = button.innerHTML;
                        button.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        setTimeout(() => {
                            button.innerHTML = originalText;
                        }, 2000);
                    }
                })
                .catch(err => {
                    console.error('复制失败:', err);
                    this.copyToClipboardFallback(text, button);
                });
        } else {
            // 回退到传统方法
            this.copyToClipboardFallback(text, button);
        }
    }

    // 复制到剪贴板的后备方法
    copyToClipboardFallback(text, button) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                if (button) {
                    const originalText = button.innerHTML;
                    button.innerHTML = '<i class="fas fa-check"></i> 已复制';
                    setTimeout(() => {
                        button.innerHTML = originalText;
                    }, 2000);
                }
            } else {
                console.error('复制失败');
            }
        } catch (err) {
            console.error('复制出错:', err);
        }
        
        document.body.removeChild(textArea);
    }
}

// 当页面加载完成时初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
}); 