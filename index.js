/**
 * Created by ruslan on 18/10/17.
 */

'use strict';


let isNodeWebkit = (typeof process === "object");

if(isNodeWebkit === false){
    console.log('Данный раздел не работает в режиме Браузера.');
    return {
        init: function(){},
        run: function(){},
        parse: function(){
            return {
                goods: {},
                meta: {},
                stat: false
            };
        },

        end: function(){}
    }
}
let os = require('os');
let fs = require('fs');
let spawn = require('child_process');
let iconv = require('iconv-lite');
let appPath = null;

(os.arch() == 'x64') ? appPath = process.env['ProgramFiles(x86)'] : appPath = process.env.PROGRAMFILES;

let BazisLink = function (settings) {
    this.path = settings || "d:/bazis";
    this.mainConfig = new Buffer(settings.mainConfig, 'base64').toString('utf8');
    this.rascroiConfig = new Buffer(settings.rascroiConfig, 'base64').toString('utf8');
    this.bazis = null;
    this.watch = null;


};


BazisLink.prototype.init = function () {

    if (!fs.existsSync()) {
        fs.mkdirSync(this.path);
    }


    try {
        // this.path = new Buffer(settings.slab.path, 'base64').toString('utf8');


        fs.writeFileSync(process.env.APPDATA + '\\Bazis8\\Settings.xml', this.mainConfig);
        fs.writeFileSync(process.env.APPDATA + '\\Bazis8\\Raskr80.ini', iconv.encode(this.rascroiConfig, 'win1251'));

        try {
            fs.closeSync(fs.openSync(this.path + 'PartnerSoft.dat', 'w'));
            //====================================================
            fs.closeSync(fs.openSync(this.path + 'SkladObrezkov.dat', 'w'));
            //=====================================================
            fs.closeSync(fs.openSync(this.path + 'BirkiPan.bir', 'w'));
        } catch (err) {
            console.log('new installation');
        }


        let buffer = "Номер заказа	Наименование	Обозначение изделия	Номер позиции	Позиция	Материал	Длина	Ширина	Длина детали	Ширина детали	Кол-во	Кромка L1 наим.	Кромка L1 обозн.	Кромка L1 толщ.	Кромка W1 наим.	Кромка W1 обозн.	Кромка W1 толщ.	Кромка L2 наим.	Кромка L2 обозн.	Кромка L2 толщ.	Кромка W2 наим.	Кромка W2 обозн.	Кромка W2 толщ.	Доп. список	Паз	См.черт.	Длина обрезка	Ширина обрезка	Код материала	№	Кол. бирок	Кол. панелей	Номер карты	Повернута	Имя модели	Артикул модели	Контур	Приоритет	Комментарий	Проект	Пластик	ID детали   \r\n";
        buffer = iconv.encode(buffer, 'win1251');
        fs.writeFileSync(this.path + 'BirkiPan.bir', buffer);


    } catch (e) {
        throw new Error('Произошла ошибка при конфигурации приложения: ' + e);
    }

};

BazisLink.prototype.run = function (msg) {
    if(msg.fileName === undefined || msg.fileName.length === 0){
        throw new Error('Не задано имя файла заказа!');
    }

    if(msg.content === undefined || msg.content.length === 0){
        throw new Error('Файл пустой.');
    }

    let content = new Buffer(msg.content, 'base64');
    let buffer = iconv.encode(content, 'win1251');
    fs.writeFileSync(this.path + msg.fileName + '.obl', buffer);



    //kill bazis process
    try {
        spawn.execSync(process.env.windir + '\\system32\\TASKKILL.exe /F /T /IM Raskr8.exe');
    } catch (e) {

    }
    this.bazis = spawn.spawn(appPath + '\\BazisSoft\\Bazis 8\\Raskr8.exe', [this.path + msg.fileName + '.obl']);
};


BazisLink.prototype.watchFile = function(callback){
    this.watch = fs.watch(this.path + 'PartnerSoft.dat', function (event, filename) {
        if (event == 'change') {
            console.log('Partner soft changed');
            let parsed = this.parse();
            if(typeof callback === 'function'){
                callback(parsed);
            }
        }

    }.bind(this));
};

BazisLink.prototype.end = function(){
    if(this.watch !== null){
        try {
            console.log('Stoping watch');
            this.watch.close();
        } catch (e) {
            console.log(e);
        }
    }

    if(this.bazis !== null){
        try {
            console.log('Closing Bazis');
            this.bazis.kill();
        }catch (e){
            console.log('Error closing Bazis', e);
        }
    }
};

BazisLink.prototype.parse = function(){
    let ret = {
        goods: {},
        meta: {},
        stat: false
    };
    let buffer = null;
    let content = null;
    try {
        buffer = fs.readFileSync(this.path + 'PartnerSoft.dat');
        buffer = iconv.decode(buffer, 'win1251');
        content = buffer;
    } catch (e) {
        Core.Alert('Ошибка чтения дянных из базиса.');
        return ret;
    }
    if (content.length == 0) {
        console.log('Пустой ответ от Базис-Раскроя');
        return ret;
    }

    let lines = content.split("\n");
    let pos = [];
    let goods = {};
    let meta = {};

    try {
        //find position of every block of data
        for (let x = 0; x < lines.length; x++) {
            if (lines[x].substr(0, 6) == 'Заказ=') {
                pos.push(x);
            }
        }
        pos.push(lines.length);

        //для каждой строки где начало Заказ=
        for (let y = 0; y < pos.length; y++) {
            let id = 0;
            let maps = [];
            let totNumCuts = 0;
            let totCutLength = 0;
            let totNumSheets = 0;
            let totNumOffcutsTo = 0;

            for (let x = pos[y]; x < pos[y + 1]; x++) {

                //if line nit deffinition of map then continue находим начало описания карты
                if (lines[x].substr(0, 6) != 'Карта=') {
                    continue;
                }
                let ln = lines[x];

                let mapId = (+ln.substr(6, ln.length)) - 1;		//id карты отсчёт идёт с нуля

                if(isNaN(mapId)){
                    Core.Alert('Error reading map ordinal number');
                    return ret;
                }

                id = +lines[x + 1].substr(9).split(' ')[0]; //получаем id материала карты

                if(isNaN(id)){
                    Core.Alert('Error reading good id');
                    return ret;
                }
                maps[mapId] = {};												//создаём объект карты
                maps[mapId].mapNum = ln.substr(6, ln.length).trim();	//номер карты базиса


                maps[mapId].length = lines[x + 2].substr(6).trim();				//Длина=
                maps[mapId].width = lines[x + 3].substr(7).trim();				//Ширина=
                maps[mapId].numSheets = lines[x + 4].substr(15).trim();			//КоличествоПлит=
                totNumSheets += +lines[x + 4].substr(15).trim();
                maps[mapId].numCuts = lines[x + 5].substr(16).trim();			//КоличествоРезов
                totNumCuts += (+lines[x + 5].substr(16)) * (+lines[x + 4].substr(15));	//увеличиваем общее количество резов для данного материала
                maps[mapId].lengthCuts = lines[x + 6].substr(11).trim();			//ДлинаРезов
                totCutLength += (+lines[x + 6].substr(11).trim()) * (+lines[x + 4].substr(15).trim()); //увеличиваем общее ДлинаРезов для данного материала
                maps[mapId].cuts = [];										//масив данных по карте
                x += 7;														//пропускаем 7 позиций для начала (7 позиций мы читали вручную)

                for (let i = x; i < pos[y + 1]; i++) {

                    if (lines[i].charAt(0) == String.fromCharCode(13) || lines[i] == '') {
                        break;
                    }

                    if (lines[i].charAt(0) != String.fromCharCode(13) || lines[i] != '') {
                        let piece = lines[i].split("\t");
                        maps[mapId].cuts.push({
                            id : piece[0],
                            length : piece[1],
                            width : piece[2],
                            x : piece[3],
                            y : piece[4],
                            unknown : piece[5].trim(),
                        });
                    }

                }
                x++;
            }
            if(id == 0){
                continue;
            }
            goods[id] = maps;
            meta[id] = {
                totNumCuts : totNumCuts,
                totCutLength : totCutLength,
                totNumSheets : totNumSheets
            };

        }

    }catch (e){
        Core.Alert('Произошла непредвиденная ошибка при разборе ответа от Базис-а: ' + e);
        console.log(e);
        return ret;
    }

    return {
        goods: goods,
        meta: meta,
        stat: true
    };

};

