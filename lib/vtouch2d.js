/**
 * Created by leewoongjae on 15. 7. 26..
 */
module.exports = (function(){
    "use strict";

    var fs = require("fs");
    var dgram = require('dgram');
    var version = "vtouch-nodejs-20150619";
    var space = {
        kinect:{
            position:{x:0,y:0,z:0},
            angle:{x:0,y:0,z:0}
        },
        objects:[]
    };

    var callback = null;

    var hit = function(_space, _callback){

        if (typeof _space == "string") {

            space = JSON.parse(fs.readFileSync("./space.json"));

        } else {

            space = _space;

        }

        callback = _callback;

    };

    var listen = function(_port, _callback){

        var self = this;

        self.udpServer = dgram.createSocket('udp4');

        self.udpServer.on('listening', function () {

            console.log("udpServer on");
            _callback(true);

        });

        self.udpServer.on('close', function () {

            console.log("udpServer close");

        });

        self.udpServer.on('error', function (err) {

            console.log("udpServer err");
            self.udpServer.close();
            _callback(false);

        });

        self.udpServer.on('message', function (message, remote) {

            /*
             데이타를 사용할 수 있는 객체 형태로 리턴 해야한다.
             */

            /* raw data => string 원본 스트링 사전 준비 */
            var strFromRawData = message.toString(); // 받은 바이트 데이타를 스트링 데이타로
            var strFromRawData_length = strFromRawData.length; // strFromRawData 의 문자열 길이

            var start = strFromRawData[0];
            var end = strFromRawData[strFromRawData_length - 1];

            /* 원본 스트링으로 raw data 유효성 체크 */
            if (strFromRawData_length < 1) return; // 문자열 길이가 0 이 아니면 통과
            if (start != "S" || end != "E") return; // 첫글자가 "S" 이고, 마지막 글자가 "E" 가 맞아야 통과

            /* 가공 데이타 추출 */
            var str = strFromRawData.substring(1, strFromRawData_length - 1);

            if (str === undefined) return;
            if (str === null) return;

            /* users array 로 분할 */
            var users = str.split("/");

            /* users 유효한지 체크 */
            if (users === undefined) return;
            if (users === null) return;

            /* 이벤트 보낼 vtouch array 와 info 객체 생성 */
            var vtouch = [{}, {}, {}, {}, {}, {}];
            var info = {};

            /* 카메라 안에 있는 유저의 숫자 체크를 위한 변수 */
            var userCountInCamera = 0;

            /* 카메라 셋 */
            var kinect = space.kinect;
            info.kinect = kinect;

            for (var i = 0; i < 6; i++) {

                if (users[i] === undefined) continue;

                var user = users[i].split(",");

                if (user[0] == "N") { // { id: 0, isTracking: false }

                    /* 초기화 */
                    var tmp = {};

                    /* 초기 속성 셋팅 */
                    tmp.id = i;
                    tmp.isTracking = false;

                    /* 적용 */
                    vtouch[i] = tmp;

                } else {

                    /* 카메라 안에 있는 유저의 숫자 체크를 위한 변수 ++ */
                    userCountInCamera++;

                    /* 초기화 */
                    var tmp = {};

                    /* 초기 속성 셋팅 */
                    tmp.id = i;
                    tmp.isTracking = true;

                    /* 눈 손 포인트 재산출 */
                    // - 오른쪽 눈
                    var rightEye = transform(Number(user[4]), Number(user[5]), Number(user[6]), kinect);

                    // - 왼쪽 눈
                    var leftEye = transform(Number(user[7]), Number(user[8]), Number(user[9]), kinect);

                    // - 손가락
                    var finger = transform(Number(user[10]), Number(user[11]), Number(user[12]), kinect);

                    tmp.rightEye = rightEye;
                    tmp.leftEye = leftEye;
                    tmp.finger = finger;

                    /* 히트 포인트 재산출 */
                    var rightHit = {};
                    rightHit.x = Math.round(((finger.x * rightEye.z) - (rightEye.x * finger.z)) / (rightEye.z - finger.z));
                    rightHit.y = Math.round(((finger.y * rightEye.z) - (rightEye.y * finger.z)) / (rightEye.z - finger.z));

                    var leftHit = {};
                    leftHit.x = Math.round(((finger.x * leftEye.z) - (leftEye.x * finger.z)) / (leftEye.z - finger.z));
                    leftHit.y = Math.round(((finger.y * leftEye.z) - (leftEye.y * finger.z)) / (leftEye.z - finger.z));

                    tmp.rightHit = rightHit;
                    tmp.leftHit = leftHit;

                    /* 2D 충돌 체크 => 하나 이상 있으면 리스트(x) 아니고 한개만 반환, 없으면 없는것으로 반환 */

                    // hit:{isHit:true,object:{id:"name",point:{x:0,y:0}}} / hit:{isHit:false,object:{}}
                    var objects = space.objects;

                    var left = (function() {

                        var hitObject = {};

                        for (var j = 0; j < objects.length; j++) {

                            // 충돌 체크
                            if ((objects[j].tl.x < leftHit.x) && (leftHit.x < objects[j].tl.x + objects[j].sz.w) && (leftHit.y < objects[j].tl.y) && (objects[j].tl.y - objects[j].sz.h < leftHit.y)) {

                                hitObject.isHit = true;
                                hitObject.id = objects[j].id;
                                hitObject.point = {};
                                var pointX = Math.round(Math.abs((leftHit.x - objects[j].tl.x) / objects[j].sz.w) * 1000) / 1000;
                                var pointY = Math.round(Math.abs((leftHit.y - objects[j].tl.y) / - objects[j].sz.h) * 1000) / 1000;
                                hitObject.point.x = pointX;
                                hitObject.point.y = pointY;

                                return hitObject;

                            }

                        }

                        return false;

                    }());

                    var right = (function() {

                        for (var j = 0; j < objects.length; j++) {

                            var hitObject = {};

                            // 충돌 체크
                            if ((objects[j].tl.x < rightHit.x) && (rightHit.x < objects[j].tl.x + objects[j].sz.w) && (rightHit.y < objects[j].tl.y) && (objects[j].tl.y - objects[j].sz.h < rightHit.y)) {

                                hitObject.isHit = true;
                                hitObject.id = objects[j].id;
                                hitObject.point = {};
                                var pointX = Math.round(Math.abs((rightHit.x - objects[j].tl.x) / objects[j].sz.w) * 1000) / 1000;
                                var pointY = Math.round(Math.abs((rightHit.y - objects[j].tl.y) / - objects[j].sz.h) * 1000) / 1000;
                                hitObject.point.x = pointX;
                                hitObject.point.y = pointY;

                                return hitObject;

                            }

                        }

                        return false;

                    }());

                    if (!right) tmp.right = {isHit:false}; // 충돌 없음.
                    else tmp.right = right; // 충돌 있음

                    if (!left) tmp.left = {isHit:false}; // 충돌 없음.
                    else tmp.left = left; // 충돌 있음

                    // 5. 터치 및 트리거 겟
                    var state = "N";
                    if (user[13] == "1") state = "S";
                    else if (user[13] == "2") state = "C";
                    else if (user[13] == "100") state = "D";
                    tmp.vision_state = state;

                    var direction = "N";
                    if (user[14] == "1") direction = "L";
                    else if (user[14] == "2") direction = "R";
                    else if (user[14] == "3") direction = "D";
                    else if (user[14] == "4") direction = "U";
                    tmp.vision_direction = direction;

                    if (direction == "N") tmp.vision_velocity = 0;
                    else tmp.vision_velocity = user[15];

                    tmp.trigger = user[13];
                    tmp.swipe = user[14];

                    // 6. 선후관계를 위해 head 활용
                    var head = transform(Number(user[1]), Number(user[2]), Number(user[3]), kinect);

                    tmp.head = head;

                    // 7. 적용
                    vtouch[i] = tmp;

                }

            }

            info.userCountInCamera = userCountInCamera;

            callback(vtouch, info);

        });

        self.udpServer.bind(_port, function() {

            console.log("udp server bind : " + _port);

        });

        return self;

    };

    var close = function(_callback) {

        this.udpServer.close();

        _callback(true);

    };

    var rotationX = function(v, angle) {

        var t = {};

        t.x = v.x;
        t.y = Math.sqrt((v.y * v.y) + (v.z * v.z)) * Math.sin(radians(angle) + Math.atan2(v.y, v.z));
        t.z = Math.sqrt((v.y * v.y) + (v.z * v.z)) * Math.cos(radians(angle) + Math.atan2(v.y, v.z));

        return t;

    };

    var rotationY = function(v, angle) {

        var t = {};

        t.x = Math.sqrt((v.x * v.x) + (v.z * v.z)) * Math.sin(radians(angle) + Math.atan2(v.x, v.z));
        t.y = v.y
        t.z = Math.sqrt((v.x * v.x) + (v.z * v.z)) * Math.cos(radians(angle) + Math.atan2(v.x, v.z));

        return t;

    };

    var radians = function(degrees) {

        return degrees * Math.PI / 180;

    };

    var transform = function(_x, _y, _z, _k) {

        var v = {x:_x,y:_y,z:_z};
        var t;

        if (_k.angle.x != 0 && _k.angle.y != 0) t = rotationY(rotationX(v, Number(_k.angle.x)), Number(_k.angle.y));
        else if (_k.angle.x != 0) t = rotationX(v, Number(_k.angle.x));
        else if (_k.angle.y != 0) t = rotationY(v, Number(_k.angle.y));
        else t = v;

        t.x = Math.round(t.x + Number(_k.position.x));
        t.y = Math.round(t.y + Number(_k.position.y));
        t.z = Math.round(t.z + Number(_k.position.z));

        return t;

    };

    var cancel = function(str) {

        var message = new Buffer(str);
        var client = dgram.createSocket("udp4");

        client.send(message, 0, message.length, 50415, "192.168.0.33", function() {

            client.close();

        });

    };

    return {

        hit:hit,
        listen:listen,
        close:close,
        cancel:cancel

    };

}());