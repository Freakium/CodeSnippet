/****************************************************/
/****************** Initialization ******************/
/****************************************************/

// Initialize Firebase (runs on start)
var initializeFirebase = function() {
	var config = {
		apiKey: apiKey,
		authDomain: "snip",
		databaseURL: "snip",
		projectId: "snip",
		storageBucket: "snip"
	};
	return firebase.initializeApp(config);
}();

// Store and get user info
var user = function() {
	var userId, username, firstName, lastName;
	return {
		setUserId: function(val) {
			userId = val;
		},
		getUserId: function() {
			return userId;
		},
		setUsername: function(val) {
			username = val;
		},
		getUsername: function() {
			return username;
		},
		setFirstName: function(val) {
			firstName = val;
		},
		getFirstName: function() {
			return firstName;
		},
		setLastName: function(val) {
			firstName = val;
		},
		getLastName: function() {
			return lastName;
		}
	};
}();

/**************************************************/
/***************** Header & Login *****************/
/**************************************************/

// login and pageload functionality
var login = function() {
	// checks if a Google authenticated user is logged in and redirects to profile.html
	function googleAuth() {
		$("#bigLoader").modal({backdrop: 'static', keyboard: false});
		firebase.auth().getRedirectResult().then(function(result) {
			if (result.credential)
			{
				window.location.replace("profile.html");	// proceed
			}
			else
				$("#bigLoader").modal("hide");
		}).catch(function(error) {
			document.getElementById('warning').innerHTML=(error.message);
			console.error(error);
		});
	}
	// get querystring from the URL and find information on that place from Google Place
	function getPlaceInfo() {
		$("#bigLoader").modal({backdrop: 'static', keyboard: false});
		var placeId = "";

		// pluck from querystring
		if(window.location.search) {
			var split = window.location.search.substring(1).split('=');
			if(split[0] == FB_PLACEID) {
				placeId = split[1];

				// get info from Google Place
				var service = new google.maps.places.PlacesService(document.getElementById('h2Title'));
				service.getDetails({placeId: placeId}, function(place) {
					// If no phone number, user cannot claim
					if(typeof place.formatted_phone_number == 'undefined') {
						$("#bigLoader").modal('hide');
						$("#modalMessage").modal({backdrop: 'static', keyboard: false});
						$("#modalMessageContent").html('<h3 class="modal-title">Phone Number Required</h3>' +
							'<div class="modal-body text-center">' +
							'<b>There is no phone number associated with this business which is required for registration. ' +
							'Please add a phone number to your Google My Business listing if you wish to continue.<br><br>' +
							'Thank you.</b><br><br><a href="login.html" id="backToLogin">Go Back to Log In Page</a></div>');
						$("#modalMessage").on("shown.bs.modal", function() {
							$('#backToLogin').focus();
						});
						return false;
					}

					// grab the necessary information from Google Place
					var businessInfo = {};
					businessInfo['name']    = place.name;
					businessInfo['phone']   = place.formatted_phone_number;
					businessInfo[FB_PLACEID] = place.place_id;

					// get phone country code (NA: +1, UK: +44)
					var intPhone = place.international_phone_number;
					var getCode = intPhone.match(/[^+][0-9]*/);
					businessInfo['countryCode'] = getCode[0];

					// get address components
					var addressComponents = place.address_components;
					var addressInfo = {};
					for( var i=0; i < addressComponents.length; i++) {
						if(addressComponents[i].types[0] == "country")
							addressInfo[addressComponents[i].types[0]] = addressComponents[i].long_name;
						else
							addressInfo[addressComponents[i].types[0]] = addressComponents[i].short_name;
					}

					// save relevant address components to businessInfo
					if(addressInfo['subpremise'])
						businessInfo['address2'] = addressInfo.subpremise;
					if(addressInfo.street_number)
						businessInfo['address'] = addressInfo.street_number + ' ' + addressInfo.route;
					else if(addressInfo.point_of_interest)
						businessInfo['address'] = addressInfo.point_of_interest + ', ' + addressInfo.route;
					businessInfo['province'] = addressInfo.administrative_area_level_1;
					businessInfo['postalCode'] = addressInfo.postal_code;
					businessInfo['country'] = addressInfo.country;
					businessInfo['geoLat'] = place.geometry.location.lat();
					businessInfo['geoLng'] = place.geometry.location.lng();

					// get city if available
					if(typeof addressInfo.locality != 'undefined')
						businessInfo['city'] = addressInfo.locality;
					else if(typeof addressInfo.postal_town != 'undefined')
						businessInfo['city'] = addressInfo.postal_town;

					// get website if restaurant has one
					if(typeof place.website != 'undefined')
						businessInfo['website'] = place.website;

					// get opening hours if they exist
					try {
						businessInfo['hours'] = place.opening_hours.periods;
					} catch(error) {
						console.error("Business has no record of opening hours.");
						console.error(error);
					}

					// save info for later
					business.setBusinessCopy(businessInfo);

					// if user logged in, register/replace with new business
					existingUserNewBusiness(placeId);

					// print to screen
					document.getElementById('h2Title').innerHTML='Create a free business user account for ' + place.name;
					document.getElementById('footer').innerHTML+='<img src="pictures/powered_by_google_on_white.png" style="float:right;margin-right:5px;"/>';
				});
			}
		}
		else	// unauthorized
			window.location.replace('login.html');
	}
	return {
		// Checks if user is already logged in. Redirects to profile.html if true.
		initLogin: function()
		{
			googleAuth();	// For Google authentication
			emailAuth();	// For Email authentication

			// Google Sign In trouble blurb
			var isIE = /*@cc_on!@*/false || !!document.documentMode;
			if(isIE)
				$('#IEGoogle').show();

			// add footer content
			populateFooter();
		},
		// handler for the forgot password modal
		forgotPasswordSaveHandler: function(form) {
			var emailAddress = form.eAddress.value;

			if(emailAddress == "") {
				document.getElementById('warning').innerHTML = "Please enter your email address.";
				document.getElementById('eAddress').focus();
			}
			else {
				passwordReset(emailAddress);
			}

			return false;
		}
	};
}();

/******************************************/
/**************** Business ****************/
/******************************************/

// general functions used in profile.html
var businessFunc = function() {
	// get the user's business and display to screen
	function getBusiness() {
		firebase.database().ref( FB_USERS + '/' + user.getUserId() + '/' + FB_BUSINESS).once('value')
		.then( function(snapshot) {
			// redirect if user has no business in profile
			if(!snapshot.exists())
				window.location.replace('claim.html');

			// make sure user is phone verified before proceeding
			checkVerification();

			// hide My Account link if user has Google account
			hideMyAccount();
			
			// get business key
			var businessKey = snapshot.val();

			// get username
			var promise = new Promise(function(resolve) {
				return userQuery(resolve);
			});

			// find business information
			var businessInfo = {};
			firebase.database().ref(FB_BUSINESSES + '/' + businessKey).once('value')
			.then( function(businessSnapshot) {
				businessSnapshot.forEach(function(businessChildSnapshot) {
					businessInfo[businessChildSnapshot.key] = businessChildSnapshot.val();
				});

				// keep a copy of business info
				businessInfo[FB_BUSINESSID] = businessKey;
				business.setBusinessCopy(businessInfo);

				// display map location
				showMap(businessInfo.name, businessInfo.geoLat, businessInfo.geoLng);

				/******** display the rest of the business data ********/
				$('#businessForm').trigger('reset');
				businessFunc.populateBusinessTypes();
				business.initPictureAddList();

				// show or don't show remaining business content if username exists
				promise.then(function(usernameSet) {
					// All basic info populated, show rest of business content
					if(populateBasicInfo(businessInfo) && usernameSet) {
						// populate currently stored pictures and social media links if available
						displayOptionals(businessInfo);
						
						// populate business type fields
						if(businessInfo.businessType1) {
							document.getElementById('businessType1').value = businessInfo.businessType1;
							$('#businessType2Div').show();
						}
						if(businessInfo.businessType2) {
							document.getElementById('businessType2').value = businessInfo.businessType2;
							$('#businessType3Div').show();
						}
						if(businessInfo.businessType3)
							document.getElementById('businessType3').value = businessInfo.businessType3;
						
						// populate cuisine type
						var cuisine;
						if(businessInfo.cuisineType) {
							cuisine = businessInfo.cuisineType;
							for(var i = 0; i < cuisine.length; i++)
							{
								let cuisineSelect = $('#cuisineType option[value="' + cuisine[i] + '"]');
								businessFunc.addCuisineType(cuisine[i], cuisineSelect.text());
								cuisineSelect.attr('disabled', true);
							}
						}

						// unhide the div holding remaining content and enable save button
						$('#remainingContent').show();
						$('#buttonsDiv').show();
					}
				});
			}).catch(function(error) {
				document.getElementById('warning').innerHTML=error.message;
				console.error(error);
			});
		}).catch(function(error) {
			document.getElementById('warning').innerHTML=error.message;
			console.error(error);
		});
	}
	return {
		// bring up modal for previewing pictures
		previewPicture: function(name, fromDB) {
			document.getElementById('pictureTitle').innerHTML = name;

			// file is in DB
			if(fromDB) {
				getPictureFromDB(name, true);
			}
			// file hasn't been uploaded yet
			else {
				getPictureFromQueue(name, true);
			}

			// show picture preview modal
			$("#modalPicture").modal('show');

			// Focus on close button when modal opens for keyboard friendliness
			$("#modalPicture").on("shown.bs.modal", function () {
				$('#closePicPreview').focus();
			});
		},
		// Handles the delete button in the preview picture modal
		deletePictureYesHandler: function(name, fromDB) {
			var promise;

			// picture hasn't been uploaded yet
			if(!fromDB) {
				// remove from add picture queue
				promise = new Promise(function(resolve) {
					for(var index in business.pictureAddList()) {
						if(business.pictureAddList()[index].name == name) {
							business.pictureAddList().splice(index, 1);
							setTimeout(resolve, 100);
							break;
						}
					}
				});
			}
			// picture is in the database
			else {
				// Delete from the DB
				promise = new Promise(function(resolve) {
					return deletePictureFromDB(name, resolve);
				});
			}

			// Close the Delete Picture modal & remove picture from profile
			promise.then( function() {
				$("#modalMessage").modal('hide');
				document.getElementById(name + 'Div').remove();
			});
		},
	}
}();

/**************************************************/
/****************** Add Business ******************/
/**************************************************/

// add business functionality
var addBusiness = function () {
	function addBusinessToDB(businessInfo) {
		// Get a key for adding new business
		var businessKey = firebase.database().ref().push().key;

		// set up info to add to DB
		var businessAdd = {};
		businessAdd[ FB_USERS + '/' + user.getUserId() + '/' + FB_BUSINESS] = businessKey;
		businessAdd[ FB_BUSINESSES + '/' + businessKey] = businessInfo;
		businessAdd[ FB_BUSINESSLIST + '/' + businessInfo.placeId + '/' + FB_USERID] = user.getUserId();
		businessAdd[ FB_BUSINESSLIST + '/' + businessInfo.placeId + '/' + FB_BUSINESSID] = businessKey;

		// Add to DB and either send verification email or verify phone
		firebase.database().ref().update(businessAdd)
		.then(function () {
			if(!firebase.auth().currentUser.emailVerified)
				registration.sendEmailVerification();
			else
				window.location.replace('verify_phone.html');
		}).catch(function(error) {
			document.getElementById('warning').innerHTML=error.message;
			console.error(error);
		});
	}
	return {
		// adds a business to the DB
		addNewBusiness: function(business) {
			addBusinessToDB(business);
		}
	};
}();