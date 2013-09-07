ModelPicker = {
	initialized: false,
	selection: null,
	models: {
		'paperwhite':		{label: 'Kindle Paperwhite',	hint: '- black-and-white display\n- no keyboard\n- builtin display backlight'},
		'touch':			{label: 'Kindle Touch',			hint: '- black-and-white display\n- no keyboard\n- no display backlight'},
		'generation4':		{label: 'Kindle 4',				hint: '- black-and-white display\n- no keyboard\n- no touch screen'},
		'keyboard':			{label: 'Kindle keyboard',		hint: '- 4 rows of circular keys\n- spacebar is below C,V,B,N,M'},
		'dx':				{label: 'Kindle DX',			hint: '- 4 rows of rounded-rectangular keys\n- spacebar is below V,B,N,M'},
		'generation2':		{label: 'Kindle 2',				hint: '- 5 rows of circular keys'},
		'generation1':		{label: 'Kindle 1',				hint: '- 5 rows of rectangular keys\n- gap between left and right half of keyboard'},
		'fire-1or2':		{label: 'Kindle Fire',			hint: '- color display\n- 7 inch (18 cm) display diagonal\n- 1024x600 pixels'},
		'fire-hd-7inch':	{label: 'Kindle Fire HD 7"',	hint: '- color display\n- 7 inch (18 cm) display diagonal\n- 1280x800 pixels'},
		'fire-hd-8p9inch':	{label: 'Kindle Fire HD 8.9"',	hint: '- color display\n- 8.9 inch (23 cm) display diagonal\n- 1920x1200 pixels'},
		'other':			{label: 'not a Kindle',			hint: '- select this option if your e-reader\n  is not an amazon Kindle'}
	},
	questions: {
		'START': {
			label:	'Show only:',
			// order of entries in questions['START'].filter defines order of appearance
			filter:	['other', 'paperwhite', 'touch', 'generation4', 'keyboard', 'dx', 'generation2', 'generation1', 'fire-1or2', 'fire-hd-7inch', 'fire-hd-8p9inch'],
			answers: [
				{label: 'models with a black/white display',	next: 'keyboard'},
				{label: 'models with a color display',			next: 'displaysize'}
			]
		},
		'displaysize': {
			label:	'',
			filter:	['fire-1or2', 'fire-hd-7inch', 'fire-hd-8p9inch', 'other'],
			selectHeader: 'Select the display size',
			answers: [
				{label: '7 inch (18 cm) diagonal, 1024x600 pixels (Kindle Fire)', model: 'fire-1or2'},
				{label: '7 inch (18 cm) diagonal, 1280x800 pixels (Kindle Fire HD 7")', model: 'fire-hd-7inch'},
				{label: '8.9 inch (23 cm) diagonal, 1920x1200 pixels (Kindle Fire HD 8.9")', model: 'fire-hd-8p9inch'}
			]
		},
		'keyboard': {
			label:	'Keyboard:',
			filter:	['paperwhite', 'touch', 'generation4', 'keyboard', 'dx', 'generation2', 'generation1', 'other'],
			answers: [
				{label: 'full alphabetic keyboard',			next: 'keys'},
				{label: 'no or only few mechanical keys',	next: 'touch'}
			]
		},
		'keys': {
			label:	'',
			filter:	['keyboard', 'dx', 'generation2', 'generation1', 'other'],
			selectHeader: 'Select the option that best describes the keyboard',
			answers: [
				{label: '5 rows of circular keys', model: 'generation2'},
				{label: '5 rows of rectangular keys with a gap between left and right half of keyboard', model: 'generation1'},
				{label: '4 rows of circular keys, spacebar is below C,V,B,N,M', model: 'keyboard'},
				{label: '4 rows of rounded-rectangular keys, spacebar is below V,B,N,M', model: 'dx'}
			]
		},
		'touch': {
			label:	'Touch:',
			filter:	['paperwhite', 'touch', 'generation4', 'other'],
			answers: [
				{label: 'display is touch sensitive',				next: 'light'},
				{label: 'display is <i>not</i> touch sensitive',	model: 'generation4'},
			]
		},
		'light': {
			label:	'Backlight:',
			filter:	['paperwhite', 'touch', 'other'],
			answers: [
				{label: 'display has a backlight',					model: 'paperwhite'},
				{label: 'display does <i>not</i> have a backlight',	model: 'touch'},
			]
		}
	}
};


ModelPicker.init = function(initParams) {

var currentQuestion = null;


function initializeModels() {
	var container = $('#model-select-container');
	var allmodels = [];
	ModelPicker.questions['START'].filter.forEach(function(mod) {
		allmodels.push(mod);
		ModelPicker.models[mod].node = $('<div class="model" name="' + mod + '"><img src="../kindle-models/' + mod + '.png"/><div>' + ModelPicker.models[mod].label + '</div></div>');
		// set title attribute programmatically to avoid escaping \n and "
		ModelPicker.models[mod].node.attr('title', ModelPicker.models[mod].label + '\n' + ModelPicker.models[mod].hint);
		ModelPicker.models[mod].node.mousedown(function() {
			setSelection($(this).attr('name'));
		});
		container.append(ModelPicker.models[mod].node);
	});
	setFilter(allmodels);
}

function initializeQuestions() {
	var container = $('#questions-container');
	var maxlevel = 0;
	
	function addQuestion(qid, level) {
		maxlevel = Math.max(maxlevel, level);
		var filter = ModelPicker.questions[qid];
		filter.level = level;
		var htmlstr = '<div class="filter"><span class="filtername">' + filter.label + '</span><div class="filteroptions">';
		if (filter.selectHeader) {
			// add select box
			htmlstr += '<select name="question-' + qid + '"><option value="-1" class="selectheader">=== ' + filter.selectHeader + ' ===</option>';
			for (var i=0; i<filter.answers.length; i++) {
				htmlstr += '<option value="' + i + '">' + filter.answers[i].label + '</option>';
			}
			htmlstr += '</select>';
		} else {
			// add radio buttons
			for (var i=0; i<filter.answers.length; i++) {
				htmlstr += '<input type="radio" name="question-' + qid + '" value="' + i + '" + id="answer-' + qid + '-' + i + '"/><label for="answer-' + qid + '-' + i + '">' + filter.answers[i].label + '</label> '
			}
		}
		htmlstr += '</div></div>';
		filter.node = $(htmlstr);
		if (filter.selectHeader) {
			filter.node.find('select').change(questionAnswered);
		} else {
			filter.node.find('input').click(questionAnswered);
		}
		container.append(filter.node);
		
		for (var i=0; i<filter.answers.length; i++) {
			if (filter.answers[i].next !== undefined) {
				addQuestion(filter.answers[i].next, level+1);
			}
		}
	}
	
	addQuestion('START', 0);
	ModelPicker.questions['FILTERHINT'] = {
		level: maxlevel + 1,
		node: $('<div class="filter">(You can filter on a finer level after selecting an option above.)</div>')
	};
	container.append(ModelPicker.questions['FILTERHINT'].node);
	ModelPicker.questions['START'].node.show();
	setCurrentQuestion('START');
	ModelPicker.questions['FILTERHINT'].node.show();
}


function questionAnswered() {
	var el = $(this);
	var qid = el.attr('name').substr(9);
	var value = el.val();
	if (value === '-1') {
		setCurrentQuestion(qid);
	} else {
		var answer = ModelPicker.questions[qid].answers[value];
		if (answer.next) {
			setCurrentQuestion(answer.next);
		} else if (answer.model) {
			setCurrentQuestion(null, ModelPicker.questions[qid].level+1);
			setFilter([answer.model]);
		}
	}
}


function setCurrentQuestion(qid, level) {
	var compareLevel;
	if (currentQuestion) {
		currentQuestion.node.removeClass('current');
	}
	var heightChange = 0;
	if (qid) {
		currentQuestion = ModelPicker.questions[qid];
		level = currentQuestion.level;
		setFilter(currentQuestion.filter);
		currentQuestion.node.find('input').prop('checked', false);
		currentQuestion.node.find('select').prop('selectedIndex',0);
		if (!currentQuestion.node.is(':visible')) {
			// assume all questions have same height (can't measure
			// height of new question because it's not visible)
			heightChange += ModelPicker.questions['START'].node.outerHeight();
		}
		currentQuestion.node.addClass('current').slideDown();
	} else {
		currentQuestion = null;
	}
	
	for (var q in ModelPicker.questions) {
		if (q !== qid && ModelPicker.questions[q].level >= level && ModelPicker.questions[q].node.is(":visible")) {
			heightChange -= ModelPicker.questions[q].node.outerHeight();
			ModelPicker.questions[q].node.slideUp();
		}
	}
	
	if (heightChange!==0 && initParams.changeHeightListener) {
		initParams.changeHeightListener(heightChange);
	}
}


function setSelection(modelName) {
	if (modelName && !ModelPicker.models[modelName].enabled) {
		return false;
	}
	if (initParams.beforeModelSelectListener) {
		if (!initParams.beforeModelSelectListener(modelName)) {
			return false;
		}
	}
	
	if (ModelPicker.selection) {
		ModelPicker.models[ModelPicker.selection].node.removeClass("selected");
	}
	ModelPicker.selection = modelName;
	
	if (modelName) {
		ModelPicker.models[modelName].node.addClass("selected");
	}
	
	if (initParams.modelSelectListener) {
		initParams.modelSelectListener(modelName);
	}
}

function setFilter(filter) {
	for (var mod in ModelPicker.models) {
		ModelPicker.models[mod].enabled = false;
	}
	filter.forEach(function(mod) {
		ModelPicker.models[mod].enabled = true;
	});
	setSelection(filter.length===1 ? filter[0] : null);
	
	for (var mod in ModelPicker.models) {
		if (ModelPicker.models[mod].enabled) {
			ModelPicker.models[mod].node.removeClass('disabled').fadeTo(400, 1);
		} else {
			ModelPicker.models[mod].node.addClass('disabled').fadeTo(400, 0.4);
		}
	}
	
	if (initParams.filterChangeListener) {
		initParams.filterChangeListener();
	}
}


initializeModels();
initializeQuestions();
ModelPicker.initialized = true; //set to ture *before* calling setselection
setSelection(initParams.selection);

};