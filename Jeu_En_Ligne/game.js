// URL de ton API PHP (à adapter selon ton adresse locale ou en ligne)
const SERVER_URL = "api.php";

// Configuration globale du jeu
let playerRole = "South"; // Rôle par défaut (à changer manuellement en "North" pour tester l'autre joueur)
let board = arrayFill(0, 14, 5); // État local du plateau (14 cases, initialisées à 5 graines)
let currentPlayer = "South";
let scoreSouth = 0;
let scoreNorth = 0;
let gameOver = false;

// Sécurisation contre l'affichage en boucle de l'alerte Reset pendant le polling
let resetPromptActive = false;

// Sélection des éléments HTML indispensables
const boardElement = document.getElementById("board");
const scoreSouthElement = document.getElementById("scoreSouth");
const scoreNorthElement = document.getElementById("scoreNorth");
const messageElement = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const roleDisplay = document.getElementById("roleDisplay");

// Affichage initial du rôle affecté au navigateur
if (roleDisplay) {
    roleDisplay.textContent = `Votre rôle : Joueur ${playerRole === "South" ? "SUD" : "NORD"}`;
}

/**
 * 1. FONCTION DE CORRESPONDANCE D'AFFICHAGE DU PLATEAU
 * Dans le Songo, les cases Sud vont de 0 à 6 (de gauche à droite).
 * Les cases Nord vont de 7 à 13 (de droite à gauche sur un vrai plateau).
 * Pour l'affichage HTML en grid, on applique un index visuel.
 */
function getVisualIndex(i) {
    if (i >= 7) {
        // Rangée du haut (Nord) : On inverse pour que l'index 13 soit à l'extrême gauche visuelle (N0)
        return 20 - i; 
    }
    // Rangée du bas (Sud) : Standard de 0 à 6
    return i;
}

/**
 * 2. RENDU VISUEL ET POPULATION DES CASES EN GRAINES
 */
function renderBoard() {
    boardElement.innerHTML = "";
    
    // Création d'un tableau ordonné visuellement pour le CSS Grid
    let sortedIndices = [];
    // Rangée Nord (7 à 13 inversé pour respecter le sens horaire visuel)
    for (let i = 13; i >= 7; i--) sortedIndices.push(i);
    // Rangée Sud (0 à 6)
    for (let i = 0; i <= 6; i++) sortedIndices.push(i);

    sortedIndices.forEach(i => {
        const pit = document.createElement("div");
        pit.className = "pit";
        
        // Ajout d'une classe CSS spécifique selon le camp
        if (i >= 7) pit.classList.add("north-pit");
        else pit.classList.add("south-pit");

        // Identification textuelle de la case pour les joueurs (Ex: S4 ou N2)
        const label = i >= 7 ? `N${13 - i}` : `S${i}`;
        
        pit.innerHTML = `
            <span class="pit-label">${label}</span>
            <div class="seeds-count">${board[i]}</div>
        `;

        // Écouteur de clic pour jouer
        pit.onclick = () => handlePitClick(i);

        boardElement.appendChild(pit);
    });

    // Mise à jour des scores et affichages textuels
    scoreSouthElement.textContent = scoreSouth;
    scoreNorthElement.textContent = scoreNorth;
}

/**
 * 3. GESTION DES CLICS SUR LES CASES DU PLATEAU
 */
async function handlePitClick(pitIndex) {
    if (gameOver) {
        displayMessage("La partie est terminée. Veuillez recommencer.");
        return;
    }

    // Sécurité client : Vérifier que le joueur clique bien dans son propre camp
    if (playerRole === "South" && pitIndex >= 7) {
        displayMessage("Interdit ! Vous ne pouvez jouer que dans le camp SUD.");
        return;
    }
    if (playerRole === "North" && pitIndex <= 6) {
        displayMessage("Interdit ! Vous ne pouvez jouer que dans le camp NORD.");
        return;
    }

    // Sécurité client : Vérifier que c'est bien son tour de jouer
    if (playerRole !== currentPlayer) {
        displayMessage("Veuillez patienter, c'est au tour de votre adversaire.");
        return;
    }

    // Sécurité client : Vérifier que la case cliquée n'est pas vide
    if (board[pitIndex] === 0) {
        displayMessage("Cette case est vide ! Choisissez une autre case.");
        return;
    }

    // Envoi du coup au serveur PHP
    try {
        const response = await fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                player: playerRole,
                pitIndex: pitIndex
            })
        });

        if (response.ok) {
            const data = await response.json();
            updateState(data);
        } else {
            const errorData = await response.json();
            displayMessage(errorData.error || "Erreur lors de l'exécution du coup.");
        }
    } catch (error) {
        displayMessage("Impossible de communiquer avec le serveur de jeu.");
    }
}

/**
 * 4. SYSTEME DE RESET PAR CONSENSUS : ENVOI ET RÉPONSES
 */

// Action lorsque le joueur clique sur le bouton "Recommencer la partie"
resetBtn.onclick = async () => {
    try {
        displayMessage("Demande de réinitialisation envoyée... En attente de l'adversaire.");
        const response = await fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "request_reset", player: playerRole })
        });
        if (response.ok) {
            const data = await response.json();
            updateState(data);
        }
    } catch (error) {
        displayMessage("Erreur réseau lors de la demande de recommencer.");
    }
};

// Fonction générique pour traiter les actions de reset (acceptation, refus, nettoyage)
async function sendResetResponse(action) {
    try {
        const response = await fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: action, player: playerRole })
        });
        if (response.ok) {
            const data = await response.json();
            updateState(data);
        }
    } catch (error) {
        console.error("Erreur lors de la réponse au reset:", error);
    }
}

/**
 * 5. SYNCHRONISATION GENERALE ET TRAITEMENT DES DONNEES REÇUES
 */
function updateState(data) {
    // Rapatriement des données brutes de jeu
    board = data.board;
    scoreSouth = data.scoreSouth;
    scoreNorth = data.scoreNorth;
    currentPlayer = data.currentPlayer;
    gameOver = data.gameOver;

    if (data.message) {
        displayMessage(data.message);
    }

    // INTERCEPTION DE LA LOGIQUE DU CONSENSUS DE RECONVERSION
    if (data.resetStatus) {
        const reqBy = data.resetStatus.requestedBy;
        const status = data.resetStatus.status;

        // ÉTAPE A : L'ADVERSAIRE a demandé à recommencer et la requête est en attente (pending)
        if (reqBy !== playerRole && status === "pending" && !resetPromptActive) {
            resetPromptActive = true; // On verrouille pour éviter les boîtes de dialogue multiples à chaque polling
            
            setTimeout(() => {
                let campDemandeur = (reqBy === "South") ? "SUD" : "NORD";
                let accept = confirm(`Ton adversaire (Joueur ${campDemandeur}) demande de recommencer la partie !\n\n[Ok] pour Accepter (le jeu se remet à zéro)\n[Annuler] pour Refuser (la partie continue)`);
                
                if (accept) {
                    sendResetResponse("accept_reset");
                } else {
                    sendResetResponse("refuse_reset");
                }
                resetPromptActive = false; // Déverrouillage après décision
            }, 100);
        }

        // ÉTAPE B : Le DEMANDEUR d'origine reçoit l'info que l'adversaire a REFUSÉ
        if (reqBy === playerRole && status === "refused") {
            alert("Ton adversaire a refusé de recommencer la partie ! Le match continue.");
            // On demande immédiatement au serveur d'effacer le drapeau "refused" pour nettoyer le fichier JSON
            sendResetResponse("clear_refusal");
        }
    }

    renderBoard();
}

/**
 * 6. REQUÊTES AUTOMATIQUES (AJAX POLLING TOUTES LES 2 SECONDES)
 */
async function checkServerUpdate() {
    // Si l'utilisateur est en train de répondre au confirm(), on suspend momentanément le polling
    if (resetPromptActive) return;

    try {
        const response = await fetch(SERVER_URL);
        if (response.ok) {
            const data = await response.json();
            updateState(data);
        }
    } catch (error) {
        console.warn("Erreur de synchronisation avec le serveur.");
    }
}

// Lancement du polling cyclique toutes les 2000 millisecondes (2 secondes)
setInterval(checkServerUpdate, 2000);

// Utilitaires secondaires
function displayMessage(msg) {
    if (messageElement) messageElement.textContent = msg;
}

function arrayFill(start, length, value) {
    let arr = [];
    for (let i = 0; i < length; i++) arr.push(value);
    return arr;
}

// Premier affichage forcé au chargement de la page
checkServerUpdate();
