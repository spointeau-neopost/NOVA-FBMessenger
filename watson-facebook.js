//------------------------------------------------------------------------------
// Copyright IBM Corp. 2017
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//------------------------------------------------------------------------------

var Botkit = require('botkit');
//require('dotenv').load();
require('dotenv').config({silent: true})
var sharedCode = require('./watson.js')();

var middleware = require('botkit-middleware-watson')({
    username: process.env.ASSISTANT_USERNAME,
    password: process.env.ASSISTANT_PASSWORD,
    workspace_id: process.env.WORKSPACE_ID,
    version_date: '2017-05-26'
});

var controller = Botkit.facebookbot({
    debug: true,
    log: true,
    access_token: process.env.FACEBOOK_PAGE_TOKEN,
    verify_token: process.env.FACEBOOK_VERIFY_TOKEN,
    app_secret: process.env.FACEBOOK_APP_SECRET,
    validate_requests: true
});

var bot = controller.spawn({
});

controller.setupWebserver(process.env.PORT || 3000, function(err, webserver) {
    controller.createWebhookEndpoints(webserver, bot, function() {
    });
});

controller.api.messenger_profile.greeting('Hello');
controller.api.messenger_profile.get_started('Hello');

var processWatsonResponse = function(bot, message) {
	if (message.watsonError) {
		return bot.reply(message, "I'm sorry, but for technical reasons I can't respond to your message");
	}
	
	//middleware.sendToWatsonAsync(bot, message, {lat: 48, lng:10});
	if (message.attachments) {
		message = analyzeMessageAttachment(bot, message);
	}
	middleware.interpret(bot, message, function (err) {
		if (!err) {
			sharedCode.handleWatsonResponse(bot, message, 'facebook');
		}
		else {            
			bot.reply(message, "I'm sorry, but for technical reasons I can't respond to your message");
		}
	});
}

function analyzeMessageAttachment(bot, message) {
	var attachments = message.attachments;
	attachments.forEach( function( oData ) {
		var sType = oData.type;
		switch (sType) {
			case 'location': 
				// Extract latitude and longitude and set them in feedback message
				message.text = 'coordinates:' + oData.payload.coordinates.lat + ',' + oData.payload.coordinates.long;
				return message;
			break;
			default:
			break;
		}
	});
	return message;
}

controller.on('message_received', processWatsonResponse);
controller.on('facebook_postback', processWatsonResponse);

