// Definition des variables globales

var fs = require('fs');
var jsonstorage = __dirname + '\\storage\\storage.json';
var tempstorage = __dirname + '\\storage\\__tempstorage';
var XMLFile = __dirname + '\\learned.xml';
var XMLTemplate = __dirname + '\\template\\learned-xml.template';
var debug = true;
//var debug = config.modules.learning.debug;

// Export Action
exports.action = function(data, callback, config, SARAH){
  // data.dictation returne toute la phrase dite par l'utilisateur
  var voiceAnalysis = data.dictation;
  if (debug) console.log("Analyse vocale Complete : "+voiceAnalysis); // ** DEBUG **
  if (debug) console.log("Type d'action : "+data.type); // ** DEUG **

  // Gestion des differents cas
  switch (data.type) {
    case "question":
      var rgxp = /.+ que dois-tu répondre .+ on te \S+ (.+)/i;
      break;
    case "learn":
      var rgxp = /tu dois répondre (.+)/i;
      break;
    default:
      var rgxp = /(.+)/i;
      break;
  }

  // on s'assure que Google a bien compris
  var match = voiceAnalysis.match(rgxp);
  if (!match || match.length <= 1){
    return callback({'tts': "Je suis désolé, je n'ai pas compris ce que vous m'avez dis. Pouvez-vous répéter ?"});
  }
  // on peut maintenant s'occuper du contenu recupéré
  voiceAnalysis = match[1];
  if (debug) console.log("Analyse vocale parsé : "+voiceAnalysis);
  // Verification de la presence d'un fichier du fichier de stockage, generation si il n'existe pas et Parsing
  verify_storage_json(jsonstorage);
  var jsoncontent = read_json(jsonstorage);

  // Actions a effectué selon les types
  switch (data.type) {
    case "question":
      // Definition du HASH pour la phrase afin de la stocker avec une valeur unique
      var search_hash = gethash(voiceAnalysis);
      // Recherche si la demande à déjà une réponse (via le HASH)
      search_json(jsoncontent, search_hash, voiceAnalysis,SARAH);
      break;
    case "learn":
      // Lecture du fichier tampon et parsing
      var tempcontent = fs.readFileSync(tempstorage,'utf8');
      var splitcontent = tempcontent.split(";");
      // Sauvegarde de la question et de la reponse
      insert_json(jsoncontent, splitcontent[0], splitcontent[1], voiceAnalysis,SARAH);
      SARAH.remote({'context' : 'default'});
      // Suppression du fichier tampon
      fs.unlink(tempstorage);
      // Generation du fichier de Grammaire XML
      XMLGen(jsoncontent,XMLFile,XMLTemplate);
      break;
    case "learned":
      // Recupération de la réponse à la question (randomisé si plusieures réponses)
      var response = getRandomResponse(jsoncontent, data.ref, SARAH);
      SARAH.speak(response);
      break;
    case "generateXML":
      // Génération du XML de grammaire a partir des données stockés
      XMLGen(jsoncontent,XMLFile,XMLTemplate);
      SARAH.answer();
      break;
  }
// Envoi d'un callback au serveur
callback();
}


///////////////////////////////////////
//// Functions
///////////////////////////////////////


// Fonction de verification et creation le cas echeant du fichier de stockage JSON
function verify_storage_json(jsonfile) {
  if (! fs.existsSync(jsonfile) || ! fs.statSync(jsonfile).isFile()) {
    fs.writeFileSync(jsonfile,'{}',"UTF-8"); // Generation du fichier de base
  }
}

// Fonction pour lire le contenu du JSON
function read_json(jsonfile) {
  var contents = fs.readFileSync(jsonfile);
  return JSON.parse(contents);
}

// Fonction de recherche d'une entrée JSON
function search_json(jsoncontent, ref, voiceAnalysis,SARAH) {
  //verifie si la demande est déjà dans le stockage
  if(jsoncontent.hasOwnProperty(ref)){
    // Recupération du nombre de réponses
    var response_list = jsoncontent[ref].response;
    var response_length = response_list.length;
    if (debug) console.log("Nombre de réponses disponible : "+response_length);
    if (response_length >= 1) {
      // Si on a plusieures réponses possibles
      if (response_length > 1) {
        var concat_response = response_list.join(" + ");
        SARAH.speak("J'ai plusieurs réponse à cela. Les réponses sont "+concat_response);
      } else {
        // Si on a une seule réponse
        SARAH.speak("Je dois répondre "+response_list[0]);
      }
      // Proposition d'ajouter des réponses complémentaires
      SARAH.askme("Souhaitez-vous que j'apprenne une réponse supplémentaire ?", {
        "Oui" : 'oui',
        "non" : 'non'
      },100000, function(answer,end) {
          // Analyse la réponse
          switch (answer) {
            case "oui":
              // SARAH demande ce qu'elle doit apprendre
              SARAH.askme("Que dois-je apprendre ?", {
                "*" : '*'
              },100000, function(answer,end) {
                if (debug) console.log("Une nouvelle réponse doit-elle être apprise : "+answer); // ** DEBUG **
                // Insertion de la nouvelle reponse dans le JSON
                update_json(jsoncontent, ref, answer);
                SARAH.speak("Merci. Je viens de l'apprendre");
                end();
              });
              break;
            case "non":
              SARAH.speak("Trés bien je n'apprend rien de plus");
              break;
          }
          end();
      });
    } else {
      // Aucune réponses trouvées
      SARAH.speak("Je n'ai pas de réponse à cela !");
    }
  } else {
    // On stocke la reference et la question en fichier tampon
    fs.writeFile(tempstorage, ref+";"+voiceAnalysis, 'utf8');
    // Passage en contexte lazylearning pour connaitre la réponse
    SARAH.speak("Je ne sais pas. Que dois-je répondre ?",function() {
			SARAH.remote({'context' : 'lazylearning.xml'});
		});
  }
}

// Fonction JSON pour enregistrer un couple question/réponse
function insert_json(jsoncontent, ref, question, response, SARAH) {
  // Mise à jour du JSON existant avec les nouveaux éléments
  jsoncontent[ref] = {'question': question, 'response': [response]};
  // Ecriture du fichier JSON
  fs.writeFile(jsonstorage,JSON.stringify(jsoncontent,null,4) , function (err) {
    SARAH.speak("Merci de me l'avoir appris") ;
  });
}

// Fonction JSON pour ajouter une réponse
function update_json(jsoncontent, ref, response) {
  // Mise à jour du JSON existant avec la nouvelle réponse
  jsoncontent[ref].response.push(response);
  // Ecriture du fichier JSON
  fs.writeFile(jsonstorage,JSON.stringify(jsoncontent,null,4));
}

// Fonction de generation de XML pour les réponses
function XMLGen(jsoncontent,XMLFile,XMLTemplate) {
  // Lecture du fichier de template
  template = fs.readFileSync(XMLTemplate,'utf8');
  // Découpage du fichier au niveau de la balise
  data = template.split("<!-- XMLGenerator -->");
  var allcontent_array = [];
  // Boucle pour génération du contenu de grammaire a partir du JSON
  [].forEach.call( Object.keys( jsoncontent ), function( key ){
    var object_ref = key;
    var object_question = jsoncontent[key].question;
    var EnGarbageStart = "";
    var EnGarbageEnd = "";
    // Si la phrase commence par un | dans ce cas, on ne met pas de GARBAGE au début
    if (! object_question.match(/^\|.+$/i)) {
      EnGarbageStart = '<ruleref special="GARBAGE" />'
    }
    // Si la phrase fini par un | dans ce cas, on ne met pas de GARBAGE a la fin
    if (! object_question.match(/^.+\|$/i)) {
      EnGarbageEnd = '<ruleref special="GARBAGE" />'
    }
    // On n'inclus pas les | du JSON dans la grammaire
    object_question = object_question.replace(/\|/g, '');
    // On push la nouvelle grammaire dans un tableau
    allcontent_array.push('\t\t<item>'+EnGarbageStart+object_question+EnGarbageEnd+'<tag>out.action.type="learned";out.action.ref="'+object_ref+'"</tag></item>');
  });
  // On rassemble tout le contenu (template + grammaire)
  allcontent_string = allcontent_array.join('\n');
  data.splice(1,0,allcontent_string);
  data = data.join(' ');
  // On ecrit le fichier XML de grammaire
  fs.writeFileSync(XMLFile,data,'utf-8');
  // Relance du client SARAH car il met en cache les réponses a priori
  // Sans cela, une fois une réponse ajouté, plus moyen de reposer les questions d'aprentissable
  // C'est la question apprise qui est comprise
  var exec = require('child_process').exec;
  var process = '"%CD%\\\\plugins\\\\learning\\\\bin\\\\reloadClient.bat"';
  var child = exec(process, function (error, stdout, stderr) {
    if (error !== null) console.log('exec error: ' + error);
  });
}

// Fonction pour la génération du HASH de la question qui sert d'identifiant unique
function gethash(query) {
  crypto = require('crypto');
  hash = crypto.createHash('sha256');
  hash.update(query);
  return hash.digest('hex');
}

// Fonction pour retourner l'ensemble des réponses à une question
function getResponse(jsoncontent, ref, SARAH) {
  if(jsoncontent.hasOwnProperty(ref)) {
    var response_list = jsoncontent[ref].response;
    return response_list;
  } else {
    SARAH.speak("Je n'ai pas de réponse à cela !");
  }
}

// Fonction pour retourner une réponse aléatoire à une question
function getRandomResponse(jsoncontent, ref, SARAH) {
  var allResponse = getResponse(jsoncontent, ref, SARAH);
  if (allResponse.length > 1 ) {
    return allResponse[Math.floor(Math.random() * allResponse.length)];
  } else {
    return allResponse[0];
  }
}
