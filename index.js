/*

Name: Veneno Traffic Bot
Version: 1.0
License: MIT
Author: Lucas Coelho de Oliveira Lima
Email: webmaster@lucasveneno.com

*/

const minimist = require('./node_modules/minimist');
const platform = require('./node_modules/platform');
const nightmare = require('./node_modules/nightmare');

let args = minimist(process.argv.slice(2), {
	alias: {
		ur : 'url',
		px : 'proxy',
		pt : 'port',
		us : 'user',
		ps : 'pass',
		ws : 'windows',
		te : 'time'
	},
	default: {
		url : 'https://iphub.info/',
		proxy : '',
		port : '',
		user: '',
		pass: '',
		windows: '1', // Total of windows to be opened
		time : '3' // Total time of the section in minutes
	}
});

// console.log('args:', args);

const venenoTrafficBot = async id => {
	'use strict';

	Array.prototype.randomElement = function () {
		return this[Math.floor(Math.random() * this.length)]
	}	

	let url = args.url;
	let proxy = args.proxy ? args.proxy + ':' + args.port : '';
	let user = args.user;
	let pass = args.pass;
	let miliseconds = args.time * 60000;
	let msperpage = (miliseconds / 6);
	let browsers = ['android-browser','chrome','firefox','internet-explorer','opera','safari'];
	let browser = browsers.randomElement(), screenArray;
	let userAgentObj = require("./useragent/"+browser+".json");
	let obj = JSON.parse(JSON.stringify(userAgentObj));
	let ua = obj.randomElement().ua;
	let info = platform.parse(ua); // Mozilla/5.0 (Macintosh; Intel Mac OS X 10.7.2; en; rv:2.0) Gecko/20100101 Firefox/4.0 Opera 11.52
	let osFamily = info.os.family; // Android, IOS, Linux, etc..

	// info.name; // 'Opera'
	// info.version; // '11.52'
	// info.layout; // 'Presto'
	// info.os; // 'Mac OS X 10.7.2'
	// info.description; // 'Opera 11.52 (identifying as Firefox 4.0) on Mac OS X 10.7.2'

	// ERRORS
	if (url == '') {
		console.log('-----------------------------------------------------');
		console.log('Oops! Please enter a url.');
		console.log('-----------------------------------------------------');
		process.exit(1);
	} else if (user == '' && pass != '') {
		console.log('-----------------------------------------------------');
		console.log('Oops! Please enter a username of the proxy server.');
		console.log('-----------------------------------------------------');
		process.exit(1);
	} else if (user != '' && pass == '') {
		console.log('-----------------------------------------------------');
		console.log('Oops! Please enter a password of the proxy server.');
		console.log('-----------------------------------------------------');
		process.exit(1);
	}

	// print process.argv
	// process.argv.forEach(function (val, index, array) { 	console.log(index + ': ' + val);  });

	// var port = ['20001', '20002', '20003', '20004', '20005', '20006', '20007', '20008', '20009', '20010', '20011', '20012', '20013', '20014', '20015', '20016', '20017', '20018', '20019', '20020', '20021', '20022', '20023', '20024', '20025', '20026', '20027', '20028', '20029', '20030', '20031', '20032', '20033', '20034', '20035', '20036', '20037', '20038', '20039', '20040', '20041', '20042', '20043', '20044', '20045', '20046', '20047', '20048', '20049', '20050', '20051', '20052', '20053', '20054', '20055', '20056', '20057', '20058', '20059', '20060', '20061', '20062', '20063', '20064', '20065', '20066', '20067', '20068', '20069', '20070', '20071', '20072', '20073', '20074', '20075', '20076', '20077', '20078', '20079', '20080', '20081', '20082', '20083', '20084', '20085', '20086', '20087', '20088', '20089', '20090', '20091', '20092', '20093', '20094', '20095', '20096', '20097', '20098', '20099', '20100', '20101', '20102', '20103', '20104', '20105', '20106', '20107', '20108', '20109', '20110', '20111', '20112', '20113', '20114', '20115', '20116', '20117', '20118', '20119', '20120', '20121', '20122', '20123', '20124', '20125', '20126', '20127', '20128', '20129', '20130', '20131', '20132', '20133', '20134', '20135', '20136', '20137', '20138', '20139', '20140', '20141', '20142', '20143', '20144', '20145', '20146', '20147', '20148', '20149', '20150', '20151', '20152', '20153', '20154', '20155', '20156', '20157', '20158', '20159', '20160', '20161', '20162', '20163', '20164', '20165', '20166', '20167', '20168', '20169', '20170', '20171', '20172', '20173', '20174', '20175', '20176', '20177', '20178', '20179', '20180', '20181', '20182', '20183', '20184', '20185', '20186', '20187', '20188', '20189', '20190', '20191', '20192', '20193', '20194', '20195', '20196', '20197', '20198', '20199', '20200', '20201', '20202', '20203', '20204', '20205', '20206', '20207', '20208', '20209', '20210', '20211', '20212', '20213', '20214', '20215', '20216', '20217', '20218', '20219', '20220', '20221', '20222', '20223', '20224', '20225', '20226', '20227', '20228', '20229', '20230', '20231', '20232', '20233', '20234', '20235', '20236', '20237', '20238', '20239', '20240', '20241', '20242', '20243', '20244', '20245', '20246', '20247', '20248', '20249', '20250', '20251', '20252', '20253', '20254', '20255', '20256', '20257', '20258', '20259', '20260', '20261', '20262', '20263', '20264', '20265', '20266', '20267', '20268', '20269', '20270', '20271', '20272', '20273', '20274', '20275', '20276', '20277', '20278', '20279', '20280', '20281', '20282', '20283', '20284', '20285', '20286', '20287', '20288', '20289', '20290', '20291', '20292', '20293', '20294', '20295', '20296', '20297', '20298', '20299', '20300', '20301', '20302', '20303', '20304', '20305', '20306', '20307', '20308', '20309', '20310', '20311', '20312', '20313', '20314', '20315', '20316', '20317', '20318', '20319', '20320', '20321', '20322', '20323', '20324', '20325', '20326', '20327', '20328', '20329', '20330', '20331', '20332', '20333', '20334', '20335', '20336', '20337', '20338', '20339', '20340', '20341', '20342', '20343', '20344', '20345', '20346', '20347', '20348', '20349', '20350', '20351', '20352', '20353', '20354', '20355', '20356', '20357', '20358', '20359', '20360', '20361', '20362', '20363', '20364', '20365', '20366', '20367', '20368', '20369', '20370', '20371', '20372', '20373', '20374', '20375', '20376', '20377', '20378', '20379', '20380', '20381', '20382', '20383', '20384', '20385', '20386', '20387', '20388', '20389', '20390', '20391', '20392', '20393', '20394', '20395', '20396', '20397', '20398', '20399', '20400', '20401', '20402', '20403', '20404', '20405', '20406', '20407', '20408', '20409', '20410', '20411', '20412', '20413', '20414', '20415', '20416', '20417', '20418', '20419', '20420', '20421', '20422', '20423', '20424', '20425', '20426', '20427', '20428', '20429', '20430', '20431', '20432', '20433', '20434', '20435', '20436', '20437', '20438', '20439', '20440', '20441', '20442', '20443', '20444', '20445', '20446', '20447', '20448', '20449', '20450', '20451', '20452', '20453', '20454', '20455', '20456', '20457', '20458', '20459', '20460', '20461', '20462', '20463', '20464', '20465', '20466', '20467', '20468', '20469', '20470', '20471', '20472', '20473', '20474', '20475', '20476', '20477', '20478', '20479', '20480', '20481', '20482', '20483', '20484', '20485', '20486', '20487', '20488', '20489', '20490', '20491', '20492', '20493', '20494', '20495', '20496', '20497', '20498', '20499', '20500', '20501', '20502', '20503', '20504', '20505', '20506', '20507', '20508', '20509', '20510', '20511', '20512', '20513', '20514', '20515', '20516', '20517', '20518', '20519', '20520', '20521', '20522', '20523', '20524', '20525', '20526', '20527', '20528', '20529', '20530', '20531', '20532', '20533', '20534', '20535', '20536', '20537', '20538', '20539', '20540', '20541', '20542', '20543', '20544', '20545', '20546', '20547', '20548', '20549', '20550', '20551', '20552', '20553', '20554', '20555', '20556', '20557', '20558', '20559', '20560', '20561', '20562', '20563', '20564', '20565', '20566', '20567', '20568', '20569', '20570', '20571', '20572', '20573', '20574', '20575', '20576', '20577', '20578', '20579', '20580', '20581', '20582', '20583', '20584', '20585', '20586', '20587', '20588', '20589', '20590', '20591', '20592', '20593', '20594', '20595', '20596', '20597', '20598', '20599', '20600', '20601', '20602', '20603', '20604', '20605', '20606', '20607', '20608', '20609', '20610', '20611', '20612', '20613', '20614', '20615', '20616', '20617', '20618', '20619', '20620', '20621', '20622', '20623', '20624', '20625', '20626', '20627', '20628', '20629', '20630', '20631', '20632', '20633', '20634', '20635', '20636', '20637', '20638', '20639', '20640', '20641', '20642', '20643', '20644', '20645', '20646', '20647', '20648', '20649', '20650', '20651', '20652', '20653', '20654', '20655', '20656', '20657', '20658', '20659', '20660', '20661', '20662', '20663', '20664', '20665', '20666', '20667', '20668', '20669', '20670', '20671', '20672', '20673', '20674', '20675', '20676', '20677', '20678', '20679', '20680', '20681', '20682', '20683', '20684', '20685', '20686', '20687', '20688', '20689', '20690', '20691', '20692', '20693', '20694', '20695', '20696', '20697', '20698', '20699', '20700', '20701', '20702', '20703', '20704', '20705', '20706', '20707', '20708', '20709', '20710', '20711', '20712', '20713', '20714', '20715', '20716', '20717', '20718', '20719', '20720', '20721', '20722', '20723', '20724', '20725', '20726', '20727', '20728', '20729', '20730', '20731', '20732', '20733', '20734', '20735', '20736', '20737', '20738', '20739', '20740', '20741', '20742', '20743', '20744', '20745', '20746', '20747', '20748', '20749', '20750', '20751', '20752', '20753', '20754', '20755', '20756', '20757', '20758', '20759', '20760', '20761', '20762', '20763', '20764', '20765', '20766', '20767', '20768', '20769', '20770', '20771', '20772', '20773', '20774', '20775', '20776', '20777', '20778', '20779', '20780', '20781', '20782', '20783', '20784', '20785', '20786', '20787', '20788', '20789', '20790', '20791', '20792', '20793', '20794', '20795', '20796', '20797', '20798', '20799', '20800', '20801', '20802', '20803', '20804', '20805', '20806', '20807', '20808', '20809', '20810', '20811', '20812', '20813', '20814', '20815', '20816', '20817', '20818', '20819', '20820', '20821', '20822', '20823', '20824', '20825', '20826', '20827', '20828', '20829', '20830', '20831', '20832', '20833', '20834', '20835', '20836', '20837', '20838', '20839', '20840', '20841', '20842', '20843', '20844', '20845', '20846', '20847', '20848', '20849', '20897'];
	// var proxies = ['139.59.195.227:8118','5.189.190.192:8880','167.71.202.105:8118'];
	// + port[Math.floor(Math.random() * (+ (port.length - 1) - + 0)) + + 0];

	if(osFamily == 'Android'){
		screenArray = [[240,320],[320,480],[480,800], [600,1024], [720,1280], [800,1280]];
	}else if(osFamily == 'IOS'){
		screenArray = [[375,812],[414,736],[375,667], [414,736], [320,568], [1024,1366]];
	}else{
		screenArray = [[640,480],[800,600], [1024,768], [1152,864], [1280,1024], [1366,768],[1600,1200]];
	}
	
	let randomScreenElement = screenArray.randomElement();
	
	const proxyNightmare = nightmare({
		executionTimeout: 1000000, // in ms
		waitTimeout: 1000000, // in ms		
		switches: {
			'proxy-server': proxy, // set the proxy server here ...	
			'ignore-certificate-errors': true	
		},
		width: randomScreenElement[0],
		height: randomScreenElement[1],
		show: true
	});

	let min = 0; 
	let max = Object.keys(obj).length - 1; 
	let random = Math.floor(Math.random() * (+max - +min)) + +min; 
	let gotourl, allLinks, addtourl;
	let utm_source = ['','facebook','twitter','instagram','Bing','Yahoo','DuckDuckGo','LinkedIn','Reddit','','Quora']
	let utm_sourcex = utm_source[(Math.floor(Math.random() * (+ (utm_source.length - 1) - + 0)) + + 0)];
	let utm_medium = ['cpc', 'Organic'];
	let utm_mediumx = utm_medium[(Math.floor(Math.random() * (+ (utm_medium.length - 1) - + 0)) + + 0)];
	let utm_term = ['queridin','queridin+music','música', 'online', 'ouvir', 'transmissão', 'tocar', 'digital', 'álbum', 'artista', 'playlist'];
	let utm_termx = utm_medium[(Math.floor(Math.random() * (+ (utm_term.length - 1) - + 0)) + + 0)];
	
	// dont allow params
	utm_sourcex = '';
	
	if (utm_sourcex != ''){
		addtourl = '?utm_source='+ utm_sourcex +'&utm_medium='+utm_mediumx+'&utm_campaign=june&utm_term='+utm_termx;
	}else{
		addtourl = '';
	}

	console.log(`Now checking ${id}`);
	console.log("OS: " + osFamily);
	console.log("Proxy: ", proxy);
	console.log("Browser: ", browser);
	console.log('Url: ', url);
	console.log("Width: ", randomScreenElement[0]);
	console.log("Height: ", randomScreenElement[1]);
	console.log("Miliseconds per page: "+ msperpage);
	console.log("Layout: " + info.layout);


	// Go
	try {

		await proxyNightmare
		.authentication(user,pass)
		.useragent(ua)
		//.authentication('', '') // ... and authenticate here before `goto`
		/*.goto('http://www.ipchicken.com')
		.evaluate(() => {
			return document.querySelector('b').innerText.replace(/[^\d\.]/g, '');
		})
		//.end()
		.then((ip) => { // This will log the Proxy's IP
			console.log('Browser:', ua);
			console.log('Proxy IP:', ip);
		})*/
		.goto(url+addtourl)	
		//.inject('js', 'jquery-3.4.1.min.js')
		.wait(msperpage)	
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;
		})
		.wait(Math.floor(Math.random() * 21000) + 15000)
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;			
		})
		.wait(msperpage)
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;		
		})
		.wait(msperpage)
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;
			
		})
		.wait(msperpage)
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;
			
		})
		.wait(msperpage)
		.evaluate(() => {
			var index;
			var blacklist = ['/account/settings','/pages/1/privacy', '/forgot-password', '/register', '/login'];

			for (index = 0; index < blacklist.length; ++index) {
				var element = document.querySelector('[href="'+blacklist[index]+'"]');

				if(element !== null){			
					element.parentNode.removeChild(element);
				}else if(element == null){

				}
			}
			
			var allLinks = document.links;
			document.location.href = allLinks[Math.floor(Math.random() * (+ (allLinks.length - 1) - + 0)) + + 0].href;
		})
		.wait(msperpage)
		.end()
		.then(function (result) {
			console.log("result: "+result);
		})
		.catch(function (error) {
			console.error('Error:', error);
		});

	} catch(e) {
		console.error("Error: ", e);
	}
}

for (var i = 0; i < args.windows; i++) {

	venenoTrafficBot(i).then(a => console.dir(a)).catch(e => console.error(e));

	console.log('#' + i);
}

