const socket = io.connect('http://localhost:3000');

const CLIENT_RTC_EVENT = 'CLIENT_RTC_EVENT';
const SERVER_RTC_EVENT = 'SERVER_RTC_EVENT';

const CLIENT_USER_EVENT = 'CLIENT_USER_EVENT';
const SERVER_USER_EVENT = 'SERVER_USER_EVENT';

const CLIENT_USER_EVENT_LOGIN = 'CLIENT_USER_EVENT_LOGIN';

const SERVER_USER_EVENT_UPDATE_USERS = 'SERVER_USER_EVENT_UPDATE_USERS';

const SIGNALING_OFFER = 'SIGNALING_OFFER';
const SIGNALING_ANSWER = 'SIGNALING_ANSWER';
const SIGNALING_CANDIDATE = 'SIGNALING_CANDIDATE';

let remoteUser = '';
let localUser = '';

function log(msg) {
    console.log(`[client] ${msg}`);
}

socket.on('connect', function() {
    log('ws connect.');
});

socket.on('connect_error', function() {
    log('ws connect_error.');
});

socket.on('error', function(errorMessage) {
    log('ws error, ' + errorMessage);
});

socket.on(SERVER_USER_EVENT, function(msg) {
    const type = msg.type;
    const payload = msg.payload;

    switch(type) {
        case SERVER_USER_EVENT_UPDATE_USERS:
            updateUserList(payload);
            break;
    }
    log(`[${SERVER_USER_EVENT}] [${type}], ${JSON.stringify(msg)}`);
});

socket.on(SERVER_RTC_EVENT, function(msg) {
    const {type} = msg;

    switch(type) {
        case SIGNALING_OFFER:
            handleReceiveOffer(msg);
            break;
        case SIGNALING_ANSWER:
            handleReceiveAnswer(msg);
            break;
        case SIGNALING_CANDIDATE:
            handleReceiveCandidate(msg);
            break;
    }
});

async function handleReceiveOffer(msg) {
    log(`receive remote description from ${msg.payload.from}`);
    
    const remoteDescription = new RTCSessionDescription(msg.payload.sdp);
    remoteUser = msg.payload.from;
    createPeerConnection();
    await pc.setRemoteDescription(remoteDescription);

    const localVideo = document.getElementById('local-video');
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = mediaStream;
    mediaStream.getTracks().forEach(track => {
        pc.addTrack(track, mediaStream);
    });
    const answer = await pc.createAnswer(); 
    await pc.setLocalDescription(answer);
    sendRTCEvent({
        type: SIGNALING_ANSWER,
        payload: {
            sdp: answer,
            from: localUser,
            target: remoteUser
        }
    });
}

async function handleReceiveAnswer(msg) {
    log(`receive remote answer from ${msg.payload.from}`);
    const remoteDescription = new RTCSessionDescription(msg.payload.sdp);
    remoteUser = msg.payload.from;
    await pc.setRemoteDescription(remoteDescription);
}

async function handleReceiveCandidate(msg){
    log(`receive candidate from ${msg.payload.from}`);
    await pc.addIceCandidate(msg.payload.candidate);
}

// user msg to server
// @param {Object} msg format as { type: 'xx', payload: {} }
function sendUserEvent(msg) {
    socket.emit(CLIENT_USER_EVENT, JSON.stringify(msg));
}

// RTC msg to server
function sendRTCEvent(msg) {
    socket.emit(CLIENT_RTC_EVENT, JSON.stringify(msg));
}

let pc = null;

async function startVideoTalk() {
    const localVideo = document.getElementById('local-video');
    const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true, 
        audio: true
    });
    localVideo.srcObject = mediaStream;

    createPeerConnection();

    mediaStream.getTracks().forEach(track => {
        pc.addTrack(track, mediaStream);
    });
}

function createPeerConnection() {
    const iceConfig = {"iceServers": [
        {url: 'stun:stun.ekiga.net'},
        {url: 'turn:turnserver.com', username: 'user', credential: 'pass'}
    ]};
    
    pc = new RTCPeerConnection(iceConfig);

    pc.onnegotiationneeded = onnegotiationneeded;
    pc.onicecandidate = onicecandidate;
    pc.onicegatheringstatechange = onicegatheringstatechange;
    pc.oniceconnectionstatechange = oniceconnectionstatechange;
    pc.onsignalingstatechange = onsignalingstatechange;
    pc.ontrack = ontrack;
    
    return pc;
}

async function onnegotiationneeded() {
    log(`onnegotiationneeded.`);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendRTCEvent({
        type: SIGNALING_OFFER,
        payload: {
            from: localUser,
            target: remoteUser,
            sdp: pc.localDescription
        }
    });
}

function onicecandidate(evt) {
    if (evt.candidate) {
        log(`onicecandidate.`);

        sendRTCEvent({
            type: SIGNALING_CANDIDATE,            
            payload: {
                from: localUser,
                target: remoteUser,
                candidate: evt.candidate
            }
        });
    }
}

function onicegatheringstatechange(evt) {
    log(`onicegatheringstatechange, pc.iceGatheringState is ${pc.iceGatheringState}.`);
}

function oniceconnectionstatechange(evt) {
    log(`oniceconnectionstatechange, pc.iceConnectionState is ${pc.iceConnectionState}.`);
}

function onsignalingstatechange(evt) {
    log(`onsignalingstatechange, pc.signalingstate is ${pc.signalingstate}.`);
}

let stream;
function ontrack(evt) {
    log(`ontrack.`);
    const remoteVideo = document.getElementById('remote-video');
    remoteVideo.srcObject = evt.streams[0];
}

async function handleUserClick(evt) {
    const target = evt.target;
    const userName = target.getAttribute('data-name').trim();

    if (userName === localUser) {
        alert('无法与自己视频会话:(');
        return;
    }

    log(`online user selected: ${userName}`);

    remoteUser = userName;
    await startVideoTalk(remoteUser);
}

// @param {Array} users
function updateUserList(users) {
    const fragment = document.createDocumentFragment();
    const userList = document.getElementById('login-users');
    userList.innerHTML = '';

    users.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = user.userName;
        li.setAttribute('data-name', user.userName);
        li.addEventListener('click', handleUserClick);
        fragment.appendChild(li);
    });    
    
    userList.appendChild(fragment);
}

// @param {String} loginName
function login(loginName) {
    localUser = loginName;
    sendUserEvent({
        type: CLIENT_USER_EVENT_LOGIN,
        payload: {
            loginName: loginName
        }
    });
}

function handleLogin(evt) {
    let loginName = document.getElementById('login-name').value.trim();
    if (loginName === '') {
        alert('用户名不可以为空🙅');
        return;
    }
    login(loginName);
}

function init() {
    document.getElementById('login-btn').addEventListener('click', handleLogin);
}

init();