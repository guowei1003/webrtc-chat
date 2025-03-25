class WebRTCHandler {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.onMessageCallback = null;
        this.onConnectionStateChangeCallback = null;
        this.isConnected = false;
        
        // STUN服务器配置
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        };
    }

    initializePeerConnection() {
        try {
            if (this.peerConnection) {
                this.close();
            }
            
            this.peerConnection = new RTCPeerConnection(this.configuration);
            
            this.peerConnection.oniceconnectionstatechange = () => {
                const state = this.peerConnection.iceConnectionState;
                console.log('ICE连接状态:', state);
                
                // 更新连接状态
                if (state === 'connected' || state === 'completed') {
                    // 不要立即设置isConnected，等待数据通道就绪
                    console.log('ICE连接已建立，等待数据通道就绪');
                } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.isConnected = false;
                    console.log('连接已断开或失败');
                    if (this.onConnectionStateChangeCallback) {
                        this.onConnectionStateChangeCallback(state);
                    }
                } else {
                    if (this.onConnectionStateChangeCallback) {
                        this.onConnectionStateChangeCallback(state);
                    }
                }
            };

            this.peerConnection.ondatachannel = (event) => {
                console.log('收到远程数据通道');
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };

            return this.peerConnection;
        } catch (error) {
            console.error('初始化PeerConnection失败:', error);
            throw new Error(`初始化连接失败: ${error.message}`);
        }
    }

    async createOffer(contactInfo) {
        if (!contactInfo || !contactInfo.nickname) {
            throw new Error('联系人信息不完整');
        }

        try {
            this.initializePeerConnection();
            
            // 创建数据通道并设置选项
            this.dataChannel = this.peerConnection.createDataChannel('messageChannel', {
                ordered: true,
                maxRetransmits: 3
            });
            
            this.setupDataChannel();

            // 创建offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });

            // 设置本地描述
            await this.peerConnection.setLocalDescription(offer);

            // 等待ICE候选者收集完成
            const candidates = await this.gatherIceCandidates();

            // 创建连接数据
            const connectionData = {
                version: '1.0',
                type: 'webrtc-offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                candidates: candidates.map(candidate => ({
                    candidate: candidate.candidate,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid
                })),
                contactInfo,
                timestamp: Date.now(),
                nonce: this.generateNonce()
            };

            // 使用UTF-8安全的编码方法
            const jsonString = JSON.stringify(connectionData);
            const base64String = this.encodeString(jsonString);
            const checksum = this.calculateChecksum(base64String);

            return `${base64String}.${checksum}`;
        } catch (error) {
            console.error('创建offer失败:', error);
            this.close();
            throw new Error(`创建连接请求失败: ${error.message}`);
        }
    }

    setupDataChannel() {
        if (!this.dataChannel) {
            throw new Error('数据通道未初始化');
        }

        console.log('设置数据通道，当前状态:', this.dataChannel.readyState);

        this.dataChannel.onopen = () => {
            console.log('数据通道已打开');
            this.isConnected = true;
            
            // 只有当数据通道打开时才报告连接成功
            if (this.onConnectionStateChangeCallback) {
                if (this.peerConnection && 
                    (this.peerConnection.iceConnectionState === 'connected' || 
                     this.peerConnection.iceConnectionState === 'completed')) {
                    this.onConnectionStateChangeCallback('connected');
                }
            }
        };

        this.dataChannel.onclose = () => {
            console.log('数据通道已关闭');
            this.isConnected = false;
            if (this.onConnectionStateChangeCallback) {
                this.onConnectionStateChangeCallback('disconnected');
            }
        };

        this.dataChannel.onerror = (error) => {
            console.error('数据通道错误:', error);
            this.isConnected = false;
            if (this.onConnectionStateChangeCallback) {
                this.onConnectionStateChangeCallback('failed');
            }
        };

        this.dataChannel.onmessage = (event) => {
            if (this.onMessageCallback) {
                try {
                    const message = JSON.parse(event.data);
                    this.onMessageCallback(message);
                } catch (error) {
                    console.error('处理消息失败:', error);
                }
            }
        };
    }

    async gatherIceCandidates() {
        return new Promise((resolve) => {
            const candidates = [];
            let candidateGatheringComplete = false;
            let timeoutId = null;
            
            const checkComplete = () => {
                if (!this.peerConnection) {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    resolve(candidates);
                    return;
                }
                
                if (candidateGatheringComplete && 
                    this.peerConnection.iceGatheringState === 'complete') {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    resolve(candidates);
                }
            };

            // 设置超时，防止永远等待
            timeoutId = setTimeout(() => {
                console.log('ICE收集超时，返回当前候选者');
                candidateGatheringComplete = true;
                checkComplete();
            }, 3000);

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('收集到ICE候选者:', event.candidate);
                    candidates.push(event.candidate);
                } else {
                    console.log('ICE候选者收集完成');
                    candidateGatheringComplete = true;
                    checkComplete();
                }
            };
        });
    }

    generateNonce() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    calculateChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    parseConnectionString(connectionString) {
        try {
            const [base64String, checksum] = connectionString.split('.');
            
            if (!base64String || !checksum) {
                throw new Error('连接码格式错误');
            }

            if (this.calculateChecksum(base64String) !== checksum) {
                throw new Error('连接码校验失败');
            }

            // 使用UTF-8安全的解码方法
            const jsonString = this.decodeString(base64String);
            const data = JSON.parse(jsonString);

            if (data.version !== '1.0' || data.type !== 'webrtc-offer') {
                throw new Error('不支持的连接码格式');
            }

            if (Date.now() - data.timestamp > 600000) {
                throw new Error('连接码已过期');
            }

            return data;
        } catch (error) {
            console.error('解析连接码失败:', error);
            throw new Error(`无效的连接码: ${error.message}`);
        }
    }

    async acceptOffer(connectionData) {
        try {
            this.initializePeerConnection();

            // 设置数据通道处理
            this.peerConnection.ondatachannel = (event) => {
                console.log('收到远程数据通道');
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };

            // 设置远程描述
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(connectionData.offer));

            // 添加ICE候选者
            for (const candidate of connectionData.candidates) {
                if (candidate) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }

            // 创建应答
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // 等待ICE候选者收集完成
            const candidates = await this.gatherIceCandidates();

            return {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                candidates: candidates.map(candidate => ({
                    candidate: candidate.candidate,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid
                }))
            };
        } catch (error) {
            console.error('接受连接请求失败:', error);
            this.close();
            throw new Error(`接受连接请求失败: ${error.message}`);
        }
    }

    async waitForDataChannel() {
        return new Promise((resolve, reject) => {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                resolve();
                return;
            }

            const checkDataChannel = () => {
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    resolve();
                } else if (!this.peerConnection || 
                          this.peerConnection.iceConnectionState === 'failed' ||
                          this.peerConnection.iceConnectionState === 'closed') {
                    reject(new Error('数据通道建立失败'));
                } else if (this.dataChannel && this.dataChannel.readyState === 'closed') {
                    reject(new Error('数据通道已关闭'));
                } else {
                    setTimeout(checkDataChannel, 100);
                }
            };

            // 设置超时
            const timeout = setTimeout(() => {
                reject(new Error('数据通道建立超时'));
            }, 10000);

            // 开始检查
            checkDataChannel();

            // 如果数据通道已经存在，监听其状态变化
            if (this.dataChannel) {
                const originalOnOpen = this.dataChannel.onopen;
                this.dataChannel.onopen = () => {
                    clearTimeout(timeout);
                    if (originalOnOpen) originalOnOpen.call(this.dataChannel);
                    resolve();
                };

                const originalOnError = this.dataChannel.onerror;
                this.dataChannel.onerror = (error) => {
                    clearTimeout(timeout);
                    if (originalOnError) originalOnError.call(this.dataChannel, error);
                    reject(new Error('数据通道错误'));
                };

                const originalOnClose = this.dataChannel.onclose;
                this.dataChannel.onclose = () => {
                    clearTimeout(timeout);
                    if (originalOnClose) originalOnClose.call(this.dataChannel);
                    reject(new Error('数据通道已关闭'));
                };
            }
        });
    }

    async sendMessage(message) {
        try {
            // 如果数据通道还没准备好，等待它准备好
            if (this.dataChannel && this.dataChannel.readyState !== 'open') {
                await this.waitForDataChannel();
            }

            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                throw new Error('数据通道未就绪');
            }

            this.dataChannel.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('发送消息失败:', error);
            throw new Error(`发送消息失败: ${error.message}`);
        }
    }

    setOnMessage(callback) {
        this.onMessageCallback = callback;
    }

    setOnConnectionStateChange(callback) {
        this.onConnectionStateChangeCallback = callback;
    }

    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    // 文件传输相关方法
    async sendFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                const arrayBuffer = reader.result;
                const fileInfo = {
                    type: 'file',
                    name: file.name,
                    size: file.size,
                    mimeType: file.type
                };

                // 发送文件信息
                await this.sendMessage(fileInfo);

                // 分块发送文件数据
                const chunkSize = 16384; // 16KB chunks
                const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

                for (let i = 0; i < totalChunks; i++) {
                    const chunk = arrayBuffer.slice(i * chunkSize, (i + 1) * chunkSize);
                    const base64Chunk = btoa(String.fromCharCode.apply(null, new Uint8Array(chunk)));
                    
                    await this.sendMessage({
                        type: 'chunk',
                        data: base64Chunk,
                        index: i,
                        total: totalChunks
                    });
                }

                resolve();
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 添加 UTF-8 编码和解码方法
    encodeString(str) {
        try {
            // 将字符串转换为UTF-8编码的字节数组
            const utf8Encoder = new TextEncoder();
            const utf8Bytes = utf8Encoder.encode(str);
            
            // 将字节数组转换为二进制字符串
            let binaryStr = '';
            utf8Bytes.forEach(byte => {
                binaryStr += String.fromCharCode(byte);
            });
            
            // 使用btoa编码二进制字符串
            return btoa(binaryStr);
        } catch (error) {
            console.error('编码失败:', error);
            throw new Error('编码失败');
        }
    }

    decodeString(base64Str) {
        try {
            // 解码base64字符串为二进制字符串
            const binaryStr = atob(base64Str);
            
            // 将二进制字符串转换为字节数组
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            
            // 将字节数组解码为UTF-8字符串
            const utf8Decoder = new TextDecoder();
            return utf8Decoder.decode(bytes);
        } catch (error) {
            console.error('解码失败:', error);
            throw new Error('解码失败');
        }
    }

    getConnectionState() {
        if (!this.peerConnection) {
            return '未初始化';
        }
        
        // 获取综合连接状态
        let overallState = '检查中';
        if (this.isConnected && this.dataChannel && this.dataChannel.readyState === 'open') {
            overallState = 'connected';
        } else if (this.peerConnection.iceConnectionState === 'failed' || 
                   (this.dataChannel && this.dataChannel.readyState === 'closed')) {
            overallState = 'failed';
        } else if (this.peerConnection.iceConnectionState === 'disconnected' || 
                   this.peerConnection.iceConnectionState === 'closed') {
            overallState = 'disconnected';
        }

        return {
            iceConnectionState: this.peerConnection.iceConnectionState,
            iceGatheringState: this.peerConnection.iceGatheringState,
            signalingState: this.peerConnection.signalingState,
            dataChannelState: this.dataChannel ? this.dataChannel.readyState : '未创建',
            isConnected: this.isConnected,
            overallState: overallState
        };
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('远程描述设置成功');
            
            // 等待数据通道就绪
            if (this.dataChannel) {
                await this.waitForDataChannel();
            }
        } catch (error) {
            console.error('处理应答失败:', error);
            throw new Error(`处理应答失败: ${error.message}`);
        }
    }
}

// 创建全局WebRTC处理器实例
const webrtc = new WebRTCHandler(); 