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

var request = require('request');
var axios 	= require('axios');

var fs = require('fs');
var path = require('path');

var geolib = require('geolib');
var NodeGeocoder = require('node-geocoder');
var options = {
	provider: 'openstreetmap',
 
	// Optional depending on the providers
	httpAdapter: 'https', // Default
	formatter: null         // 'gpx', 'string', ...
};
var geocoder = NodeGeocoder(options);

module.exports = function () {
    return {
        "handleWatsonResponse": function (bot, message, clientType) {
            let customSlackMessage = false;
            let customFacebookMessage = false;
            let actionToBeInvoked = false;
			let attachmentToAdd = false;
			let quickMessageToBeInvoked = false;
			
            if (message.watsonData) {
                if (message.watsonData.output) {
                    if (message.watsonData.output.context) {
                        if (message.watsonData.output.context.slack) {
                            if (clientType == 'slack') {
                                customSlackMessage = true;
                            }
                        }
                        if (message.watsonData.output.context.facebook) {
                            if (clientType == 'facebook') {
                                customFacebookMessage = true;
                            }
                        }
                    }
					if (message.watsonData.output.action) {
						actionToBeInvoked = true;
					}
					if (message.watsonData.output.attachment) {
						attachmentToAdd = true;
					}
					if (message.watsonData.output.quick_message) {
						quickMessageToBeInvoked = true;
					}
                }
            }
			
			if (actionToBeInvoked == true) {
				if(message.watsonData.output.text !== '') {
					bot.replyWithTyping(message, message.watsonData.output.text.join('\n'));
				}
                invokeAction(message.watsonData.output, bot, message);
            } 
			else if (attachmentToAdd == true) {
				//bot.replyWithTyping(message, message.watsonData.output.text.join('\n'));
				invokeAttachment(message.watsonData.output, bot, message);
			}
			else if (quickMessageToBeInvoked == true) {
				invokeQuickMessage(message.watsonData.output, bot, message);
			}
            else {
                if (customSlackMessage == true) {
                    bot.replyWithTyping(message, message.watsonData.output.context.slack);
                } else {
                    if (customFacebookMessage == true) {
                        bot.replyWithTyping(message, message.watsonData.output.context.facebook);
                    }
                    else {
						if(message.watsonData.output.text[0] !== undefined ) {
							bot.replyWithTyping(message, message.watsonData.output.text.join('\n'));
						}
                    }
                }
            }
        }
    }
}

function invokeQuickMessage(watsonDataOutput, bot, message) {
	var quick_reply = {
		"text": watsonDataOutput.quick_message.text,
		"quick_replies": watsonDataOutput.quick_message.quick_replies
	};
	bot.reply(message, {
        "text": watsonDataOutput.quick_message.text,
		"quick_replies": [
			{
				"content_type": watsonDataOutput.quick_message.quick_replies[0].content_type
			}
		]
    });
}

function invokeAttachment(watsonDataOutput, bot, message) {
	var receivedAttachment = watsonDataOutput.attachment;
	var attachment = {
		'type': 'template',
		'payload': {
			'template_type':'generic',
			'elements': [
				receivedAttachment
			]
		}
	}
	bot.reply(message, {
        attachment: attachment,
    });
}

function invokeAction(watsonDataOutput, bot, message) {
    let actionName 	= watsonDataOutput.action.name;
	let answer 		= '';

    switch (actionName) {
        case 'lookupWeather':
            lookupWeather(watsonDataOutput, bot, message);
            break;

        case 'get-time':
            answer = "It's " + new Date().getHours() + " o'clock and "
                + new Date().getMinutes() + " minutes";
            bot.replyWithTyping(message, answer);
            break;
		
		case 'search_parcel':
			lookupParcel(watsonDataOutput, bot, message);
			break;
			
		case 'search_promo':
			answer = "Action requested " + actionName;
			bot.replyWithTyping(message, answer);
			break;
		
		case 'search_locker':
			lookupParcelLocker(watsonDataOutput, bot, message);
			break;
		
        default:
            bot.replyWithTyping(message, "Sorry, I cannot execute what you've asked me to do");
    }
}

function lookupWeather(watsonDataOutput, bot, message) {
    let coordinates;
    let location = watsonDataOutput.context.action.location;

    switch (location) {
        case 'Munich':
            coordinates = '48.13/11.58';
            break;
        case 'Hamburg':
            coordinates = '53.55/9.99';
            break;
        default:
            coordinates = '52.52/13.38'; // Berlin
    }

    let weatherUsername = process.env.WEATHER_USERNAME;
    let weatherPassword = process.env.WEATHER_PASSWORD;
    let weatherUrl = 'https://' + weatherUsername + ':' + weatherPassword + '@twcservice.mybluemix.net:443/api/weather/v1/geocode/' + coordinates + '/observations.json?units=m&language=en-US';

    request(weatherUrl, function (error, response, body) {
        var info = JSON.parse(body);
        let answer = "The current temperature in " + info.observation.obs_name
            + " is " + info.observation.temp + " °C"
        bot.replyWithTyping(message, answer);
    })
}

function lookupParcel(watsonDataOutput, bot, message) {
	let answer = '';
	loginLookupParcel(watsonDataOutput, function(err, response) {
		var url = process.env.TV2_TRACKING_SHIPMENT_URL || '<url>';
		if (err) {
			answer = "Ooops it seems I cannot connect to the tracking service now. Can you retry later?";
			console.log(err);
			bot.replyWithTyping(message, answer);
		} else {
			var parameters = watsonDataOutput.action.parameters;
			axios.defaults.headers.common['x-access-token'] = response.token;
			axios.get( url, {
				params: {
					"q": "*",
					"filters": true,
					"match_attributes.shipmentReference": parameters.tracking_number,
					"match_attributes.deliveryAddress.contact.email": parameters.user_email
				}
			})
			.then(function(response) {
				if(response.data.code == 200) {
					var jsonData = JSON.parse(JSON.stringify(response.data.data));
					if(response.data.total == 0) {
						bot.replyWithTyping(message, 'Sorry but I cannot find the parcel ' + parameters.tracking_number + ' associated to email ' + parameters.user_email + '.');
					}
					else if(response.data.total == 1) {
						var result = jsonData[0];
						replyWithGenericTemplate(bot, message, result);
					}
					else {
						bot.replyWithTyping(message, 'I have found ' + response.data.total + ' associated to that request.');
					}
				}
				else {
					bot.replyWithTyping(message, 'Sorry but I cannot get an answer now, please retry later.');
				}
			})
			.catch(function(error) {
				answer = "Ooops it seems I encountered a problem while looking for your parcel. Can you retry later?";
				console.log(err);
				bot.replyWithTyping(message, answer);
			});
		}
	});
}

function replyWithGenericTemplate(bot, message, response) {
	var eventDate = new Date(response._source.current.event.occurredAt);
	var attachment = {
		'type': 'template',
		'payload': {
			'template_type':'generic',
			'elements': [
				{
					'title': 'Parcel ' + response._source.attributes.shipmentReference + ' for ' + response._source.attributes.deliveryAddress.contact.personCivility + ' ' + response._source.attributes.deliveryAddress.contact.personFirstName + ' ' + response._source.attributes.deliveryAddress.contact.personLastName + ' is ' + response._source.current.phase.name,
					'subtitle': 'Last status is "' + response._source.current.event.status + '" at ' + eventDate.toLocaleString('fr-FR'),
					'image_url': 'https://shipping.neopost.com/sites/shipping.neopost.com/files/styles/w560/public/track_trace_data_225x225-2015_1.jpg?itok=ZzzxqII9',
					'buttons': [
						{
							'type': 'web_url',
							'url': process.env.TV2_URL + response._source.attributes.deliveryAddress.contact.email + '/' + response._source.attributes.shipmentReference + '/',
							'title': 'View Tracking'
						}
					]
				}
			]
		}
	}
	bot.reply(message, {
        attachment: attachment,
    });
}

function loginLookupParcel(data, callback) {
	var url 	= process.env.TV2_LOGIN_URL || '<url>';
	var token 	= null; 

	axios.post( url, {
		"email": process.env.TV2_LOGIN || '<username>',
		"password": process.env.TV2_PASSWORD || '<password>'
	})
	.then(function(response) {
		if( response.status == 200 && response.data ) {
			token = response.data;
		}
		callback(null, token);
	})
	.catch(function(error) {
		callback(error, null);
	});
}

function lookupParcelLocker(watsonDataOutput, bot, message) {
	const csvFilePath = 'data/PLParcelLockers.csv';
	const csv = require('csvtojson');
	var listLockers = [];
	var answer = '';
	
	var lat = message.watsonData.context.lat;
	var lng = message.watsonData.context.lng;
	
	// Bagneux
	//var lat = 48.804757;
	//var lng = 2.324413;
	
	// Using callback
	geocoder.reverse({lat:lat, lon:lng}, function(err, res) {
		//console.log(lat + ' -- ' + lng);
		//console.log(res);
	});
	
	csv()
	.fromFile(csvFilePath)
	.on('json',(jsonObj) => {
		// combine csv header row and csv line to a json object
		// jsonObj.a ==> 1 or 4
		//console.log(jsonObj);
		if(jsonObj.PL_ADD_Latitude != null && jsonObj.PL_ADD_Longitude != null ) {
			var distance = geolib.getDistance(
				{latitude: lat, longitude: lng},
				{latitude: jsonObj.PL_ADD_Latitude, longitude: jsonObj.PL_ADD_Longitude}
			);
			listLockers.push({ 
				'name': jsonObj.PL_PAL_ShortDescription,
				'id': jsonObj.PL_PAL_Identification,
				'address1': jsonObj.PL_ADD_Address1,
				'address2': jsonObj.PL_ADD_Address2,
				'zip': jsonObj.PL_ADD_Zip,
				'city': jsonObj.PL_ADD_City,
				'latitude': jsonObj.PL_ADD_Latitude,
				'longitude': jsonObj.PL_ADD_Longitude,
				'distance': distance
			});
		}
	})
	.on('done',(error)=>{
		listLockers.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
		var oElements = [];
		// List is maximum 4 elements (including header)
		for (var i = 0; i < 3; i++) {
			if(listLockers[i] != undefined) {
				oElements.push( buildParcelLockerListElement(listLockers[i]) );
			}
		}
		// Minimum 2 elements (including header)
		if(oElements.length == 0) {
			answer = "Sorry I can't find any Packcity near you";
			bot.replyWithTyping(message, answer);
		}
		else {
			message.watsonData.output.text = 'Here are the closest Packcity';
			replyWithListElement(bot, message, 'large', oElements);
		}
	});
}

function buildParcelLockerListElement(oLocker) {
	var oElement = {
		'title': oLocker.name + ' (' + oLocker.distance + ')',
		'subtitle': oLocker.address2 + ', ' + oLocker.zip + ' ' + oLocker.city,
		'buttons': [{
			'title': 'View',
			'type': 'web_url',
			'url': 'https://www.google.com/maps/search/?api=1&query=' + oLocker.latitude + ',' + oLocker.longitude,
			'messenger_extensions': false,
            'webview_height_ratio': 'full'
		}]
	};
	return oElement;
}

function replyWithListElement(bot, message, sType, oElements) {
	oElements.unshift({
		'title': oElements.length + ' nearest Packcity',
		'subtitle': 'Click on "View" to search on map',
		'image_url': 'https://shipping.neopost.com/sites/shipping.neopost.com/files/styles/teaser_product/public/page/packcity_consigne_930x570-2015b.jpg?itok=Tqr7WZne'
	});
	var attachment = {
		'type': 'template',
		'payload': {
			'template_type': 'list',
			'top_element_style': sType,
			'elements': oElements
		}
	}
	bot.reply(message, {
        attachment: attachment,
    });
}
