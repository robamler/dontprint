var ModelPicker = {
	initialized: false,
	selection: null,
	models: {
		'kindle-paperwhite':      {label: 'Kindle Paperwhite Generation 1 or 2', hint: '- black-and-white display\n- builtin display backlight\n- the word "kindle" is written *white one black*\n  below the screen'},
		'kindle-paperwhite3':     {label: 'Kindle Paperwhite Generation 3', hint: '- higher resolution than the older Kindle\n  Paperwhite models\n- the word "kindle" is written *black one gray*\n  below the screen\n- also known as "Kindle Paperwhite 2015"'},
		'kindle-voyage':          {label: 'Kindle Voyage', hint: '- black-and-white display\n- builtin display backlight\n- very high display resolution (300ppi)'},
		'kindle-touch':           {label: 'Kindle Touch / 7', hint: '- black-and-white display\n- no display backlight'},
		'kindle-generation4':     {label: 'Kindle 4', hint: '- black-and-white display\n- no touch screen'},
		'kindle-keyboard':        {label: 'Kindle Keyboard', hint: '- 4 rows of circular keys\n- spacebar is below C,V,B,N,M'},
		'kindle-dx':              {label: 'Kindle DX', hint: '- 4 rows of rounded-rectangular keys\n- spacebar is below V,B,N,M'},
		'kindle-generation2':     {label: 'Kindle 2', hint: '- 5 rows of circular keys'},
		'kindle-generation1':     {label: 'Kindle 1', hint: '- 5 rows of rectangular keys\n- gap between left and right half of keyboard'},
		'kindle-fire-1or2':       {label: 'Kindle Fire', hint: '- color display\n- 7 inch (18 cm) display diagonal\n- 1024x600 pixels'},
		'kindle-fire-hd-7inch':   {label: 'Kindle Fire HD 7"', hint: '- color display\n- 7 inch (18 cm) display diagonal\n- 1280x800 pixels'},
		'kindle-fire-hd-8p9inch': {label: 'Kindle Fire HD 8.9"', hint: '- color display\n- 8.9 inch (23 cm) display diagonal\n- 1920x1200 pixels'},
		'sony-prs-t1':            {label: 'Sony PRS-T1', hint: ''},
		'sony-prs-t2':            {label: 'Sony PRS-T2', hint: ''},
		'sony-prs-t3':            {label: 'Sony PRS-T3(S)', hint: ''},
		'sony-prs-300':           {label: 'Sony PRS-300 Pocket Edition', hint: ''},
		'sony-prs-350':           {label: 'Sony PRS-350 Pocket Edition', hint: ''},
		'sony-prs-500':           {label: 'Sony PRS-500', hint: ''},
		'sony-prs-505':           {label: 'Sony PRS-505', hint: ''},
		'sony-prs-600':           {label: 'Sony PRS-600 Touch Edition', hint: ''},
		'sony-prs-650':           {label: 'Sony PRS-650 Touch Edition', hint: ''},
		'sony-prs-700':           {label: 'Sony PRS-700', hint: ''},
		'sony-prs-900bc':         {label: 'Sony PRS-900BC Daily Edition', hint: ''},
		'sony-prs-950sc':         {label: 'Sony PRS-950SC Daily Edition', hint: ''},
		'other':	              {label: 'Other e-reader', hint: '(select this option if your e-reader is not listed here)'}
	},
	questions: {
		'START': {
			label:	'Brand:',
			// order of entries in questions['START'].filter defines order of appearance
			filter:	[
				'other',
				'kindle-paperwhite',
				'kindle-paperwhite3',
				'kindle-voyage',
				'kindle-touch',
				'kindle-generation4',
				'kindle-keyboard',
				'kindle-dx',
				'kindle-generation2',
				'kindle-generation1',
				'kindle-fire-1or2',
				'kindle-fire-hd-7inch',
				'kindle-fire-hd-8p9inch',
				'sony-prs-t1',
				'sony-prs-t2',
				'sony-prs-t3',
				'sony-prs-300',
				'sony-prs-350',
				'sony-prs-500',
				'sony-prs-505',
				'sony-prs-600',
				'sony-prs-650',
				'sony-prs-700',
				'sony-prs-900bc',
				'sony-prs-950sc'
			],
			selectHeader: 'Select your e-reader manufacturer',
			answers: [
				{label: 'Amazon Kindle', next: 'kindle'},
				{label: 'Sony', models: ['other', 'sony-prs-t1', 'sony-prs-t2', 'sony-prs-t3', 'sony-prs-300', 'sony-prs-350', 'sony-prs-500', 'sony-prs-505', 'sony-prs-600', 'sony-prs-650', 'sony-prs-700', 'sony-prs-900bc', 'sony-prs-950sc']},
				{label: 'Other e-reader brand', model: 'other'}
			]
		},
		'kindle': {
			label:	'Display:',
			filter:	['other', 'kindle-paperwhite', 'kindle-paperwhite3', 'kindle-voyage', 'kindle-touch', 'kindle-generation4', 'kindle-keyboard', 'kindle-dx', 'kindle-generation2', 'kindle-generation1', 'kindle-fire-1or2', 'kindle-fire-hd-7inch', 'kindle-fire-hd-8p9inch'],
			answers: [
				{label: 'black/white display',	next: 'kindle-keyboard'},
				{label: 'color display',		next: 'displaysize'}
			]
		},
		'displaysize': {
			label:	'',
			filter:	['other', 'kindle-fire-1or2', 'kindle-fire-hd-7inch', 'kindle-fire-hd-8p9inch'],
			selectHeader: 'Select the display size',
			answers: [
				{label: '7 inch (18 cm) diagonal, 1024x600 pixels (Kindle Fire)', model: 'kindle-fire-1or2'},
				{label: '7 inch (18 cm) diagonal, 1280x800 pixels (Kindle Fire HD 7")', model: 'kindle-fire-hd-7inch'},
				{label: '8.9 inch (23 cm) diagonal, 1920x1200 pixels (Kindle Fire HD 8.9")', model: 'kindle-fire-hd-8p9inch'}
			]
		},
		'kindle-keyboard': {
			label:	'Keyboard:',
			filter:	['other', 'kindle-paperwhite', 'kindle-paperwhite3', 'kindle-voyage', 'kindle-touch', 'kindle-generation4', 'kindle-keyboard', 'kindle-dx', 'kindle-generation2', 'kindle-generation1'],
			answers: [
				{label: 'full alphabetic keyboard',			next: 'keys'},
				{label: 'no or only few mechanical keys',	next: 'kindle-touch'}
			]
		},
		'keys': {
			label:	'',
			filter:	['other', 'kindle-keyboard', 'kindle-dx', 'kindle-generation2', 'kindle-generation1'],
			selectHeader: 'Select the option that best describes the kindle-keyboard',
			answers: [
				{label: '5 rows of circular keys', model: 'kindle-generation2'},
				{label: '5 rows of rectangular keys with a gap between left and right half of keyboard', model: 'kindle-generation1'},
				{label: '4 rows of circular keys, spacebar is below C,V,B,N,M', model: 'kindle-keyboard'},
				{label: '4 rows of rounded-rectangular keys, spacebar is below V,B,N,M', model: 'kindle-dx'}
			]
		},
		'kindle-touch': {
			label:	'Touch:',
			filter:	['other', 'kindle-paperwhite', 'kindle-paperwhite3', 'kindle-voyage', 'kindle-touch', 'kindle-generation4'],
			answers: [
				{label: 'display is touch sensitive',				next: 'light'},
				{label: 'display is <i>not</i> touch sensitive',	model: 'kindle-generation4'},
			]
		},
		'light': {
			label:	'',
			filter:	['other', 'kindle-paperwhite', 'kindle-paperwhite3', 'kindle-voyage', 'kindle-touch'],
			selectHeader: 'Select the display type',
			answers: [
				{label: 'Normal-resolution display (167ppi) with backlight', models: ['kindle-paperwhite']},
				{label: 'High-resolution display (300ppi) with backlight', models: ['kindle-voyage', 'kindle-paperwhite3']},
				{label: 'Display without backlight', model: 'kindle-touch'}
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
		ModelPicker.models[mod].node = $('<div class="modelcontainer"><div class="model" name="' + mod + '"><img src="../model-picker/' + mod + '.png"/><div>' + ModelPicker.models[mod].label + '</div></div></div>');
		// set title attribute programmatically to avoid escaping \n and "
		ModelPicker.models[mod].node.children().attr('title', ModelPicker.models[mod].label + '\n' + ModelPicker.models[mod].hint);
		ModelPicker.models[mod].node.children().mousedown(function() {
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
		if (typeof qid === "undefined") {
			return;
		}
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
	ModelPicker.questions['START'].node.show();
	setCurrentQuestion('START');
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
		} else if (answer.models) {
			setCurrentQuestion(null, ModelPicker.questions[qid].level+1);
			setFilter(answer.models);
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
			ModelPicker.models[mod].node.removeClass('hidden');
		} else {
			ModelPicker.models[mod].node.addClass('hidden');
		}
	}
}


initializeModels();
initializeQuestions();
ModelPicker.initialized = true; //set to ture *before* calling setselection
setSelection(initParams.selection);

};