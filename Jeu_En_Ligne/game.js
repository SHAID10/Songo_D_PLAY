// Sélection des éléments HTML
const boardDiv = document.getElementById("board");
const scoreNorthElement = document.getElementById("scoreNorth");
const scoreSouthElement = document.getElementById("scoreSouth");
const currentPlayerElement = document.getElementById("currentPlayer");
const message = document.getElementById("message");

/* Topologie linéaire du plateau de jeu adaptée à la distribution horaire (RADIMESE) :
  Le tableau fait 14 cases.
  - Indices 0 à 6  : Camp SUD (S0 à S6, de gauche à droite sur l'écran)
  - Indices 7 à 13 : Camp NORD (N6 à N0, de droite à gauche sur l'écran pour rester face à face)
  
  Ordre de distribution HORAIRE (Aiguilles d'une montre) :
  S6 -> S5 -> S4 -> S3 -> S2 -> S1 -> S0 -> N0 -> N1 -> N2 -> N3 -> N4 -> N5 -> N6 -> S6...
  Ce qui correspond à RECULER dans les indices du tableau : (index - 1 + 14) % 14
*/
let board = new Array(14).fill(5); // 5 graines par case au départ (Total 70)

let currentPlayer = "South";
let scoreNorth = 0;
let scoreSouth = 0;
let gameOver = false;

// Cartographie visuelle pour correspondre à une grille CSS 7x2
// Rangée du haut (Nord) : N0, N1, N2, N3, N4, N5, N6 -> correspond aux indices [13, 12, 11, 10, 9, 8, 7]
// Rangée du bas (Sud)   : S0, S1, S2, S3, S4, S5, S6 -> correspond aux indices [0, 1, 2, 3, 4, 5, 6]
const visualMapping = [
    13, 12, 11, 10, 9, 8, 7,  // Ligne Nord (indices du tableau)
    0,  1,  2,  3,  4,  5, 6   // Ligne Sud (indices du tableau)
];

function renderBoard() {
    boardDiv.innerHTML = "";

    // On génère les cellules dans l'ordre de la grille HTML (Nord en haut, Sud en bas)
    visualMapping.forEach(index => {
        const isNorth = (index >= 7);
        createCell(index, isNorth);
    });

    scoreNorthElement.textContent = scoreNorth;
    scoreSouthElement.textContent = scoreSouth;
    currentPlayerElement.textContent = currentPlayer === "South" ? "Sud" : "Nord";
}

function createCell(index, isNorth) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.classList.add(isNorth ? "north" : "south");
    cell.textContent = board[index];

    // Clic utilisateur
    cell.onclick = () => {
        if (gameOver) return;
        play(index);
    };

    boardDiv.appendChild(cell);
}

// Vérifie si la case appartient au joueur actif
function isPlayerPit(index) {
    if (currentPlayer === "South") return index >= 0 && index <= 6;
    return index >= 7 && index <= 13;
}

// Sens de rotation du Songo : Aiguilles d'une montre (Horaire)
function nextPit(index) {
    return (index - 1 + 14) % 14;
}

// Sens inverse de la distribution (servira à remonter la rafle des captures)
function prevPit(index) {
    return (index + 1) % 14;
}

// Compte le nombre total de graines dans un camp donné
function countCampSeeds(player) {
    let start = player === "South" ? 0 : 7;
    let sum = 0;
    for (let i = start; i < start + 7; i++) {
        sum += board[i];
    }
    return sum;
}

// Trouve le nombre maximal de graines présentes dans une seule case du camp du joueur
function getMaxSeedsInCamp(player) {
    let start = player === "South" ? 0 : 7;
    let max = 0;
    for (let i = start; i < start + 7; i++) {
        if (board[i] > max) max = board[i];
    }
    return max;
}

function play(index) {
    // 1. Validation de base du coup
    if (!isPlayerPit(index)) {
        displayMessage("Ce n'est pas votre camp !");
        return;
    }
    if (board[index] === 0) {
        displayMessage("Cette case est vide !");
        return;
    }

    const opponent = currentPlayer === "South" ? "North" : "South";
    const opponentEmptyBefore = (countCampSeeds(opponent) === 0);

    // 2. Règle de solidarité : si l'adversaire est affamé, on doit jouer la case contenant le max de graines
    if (opponentEmptyBefore) {
        const maxAvailable = getMaxSeedsInCamp(currentPlayer);
        if (board[index] < maxAvailable) {
            displayMessage("Règle de solidarité ! Vous devez nourrir l'adversaire en jouant votre case contenant le maximum de graines.");
            return;
        }
    }

    // Copie de sauvegarde du plateau pour tester la validité des captures (règle anti-assèchement)
    let tempBoard = [...board];
    let tempScoreSouth = scoreSouth;
    let tempScoreNorth = scoreNorth;

    // Execution de la distribution sur la simulation
    let seeds = tempBoard[index];
    tempBoard[index] = 0;
    let current = index;

    if (seeds > 13) {
        // --- CAS DU GRENIER / NDÀ (> 13 graines) ---
        // 1er tour : On dépose 1 graine dans chacune des 13 autres cases du plateau
        for (let t = 0; t < 13; t++) {
            current = nextPit(current);
            tempBoard[current]++;
            seeds--;
        }
        // La 14ème graine (si elle existe) est capturée directement par le joueur (Automatique)
        if (seeds === 1) {
            if (currentPlayer === "South") tempScoreSouth++;
            else tempScoreNorth++;
            seeds--;
        } else if (seeds > 1) {
            // S'il reste plus d'une graine, distribution EXCLUSIVE dans le camp adverse
            let oppStart = (currentPlayer === "South") ? 7 : 0;
            // Dans le camp adverse, le sens horaire implique de parcourir les indices du tableau différemment
            // Pour le Sud qui distribue chez le Nord : N0(13)->N1(12)->N2(11)->N3(10)->N4(9)->N5(8)->N6(7)
            // Pour le Nord qui distribue chez le Sud : S6(6)->S5(5)->S4(4)->S3(3)->S2(2)->S1(1)->S0(0)
            let oppOrder = (currentPlayer === "South") 
                ? [13, 12, 11, 10, 9, 8, 7] 
                : [6, 5, 4, 3, 2, 1, 0];
                
            let oppIdx = 0;
            while (seeds > 0) {
                let targetPit = oppOrder[oppIdx % 7];
                tempBoard[targetPit]++;
                current = targetPit; // La dernière case reçue met à jour l'arrivée
                seeds--;
                oppIdx++;
            }
        }
    } else {
        // --- DISTRIBUTION STANDARD ---
        while (seeds > 0) {
            current = nextPit(current);
            tempBoard[current]++;
            seeds--;
        }
    }

    // Calcul des captures potentielles sur la simulation
    let capturedSeeds = 0;
    let checkPit = current;
    let isOpponentPit = (currentPlayer === "South") ? (checkPit >= 7) : (checkPit <= 6);

    // On ne récolte que si l'on finit chez l'adversaire
    if (isOpponentPit) {
        while (isOpponentPit) {
            // Interdiction de capturer sur les extrémités (S6 pour Nord, N0 pour Sud)
            if (currentPlayer === "South" && checkPit === 13) break; // N0 est l'indice 13
            if (currentPlayer === "North" && checkPit === 6) break;  // S6 est l'indice 6

            // La condition de récolte : la case doit contenir 2, 3 ou 4 graines APRÈS dépôt
            if (tempBoard[checkPit] >= 2 && tempBoard[checkPit] <= 4) {
                capturedSeeds += tempBoard[checkPit];
                tempBoard[checkPit] = 0;
                // On remonte la rafle dans le sens inverse de la distribution
                checkPit = prevPit(checkPit);
                isOpponentPit = (currentPlayer === "South") ? (checkPit >= 7) : (checkPit <= 6);
            } else {
                break; // Interruption immédiate de la rafle dès qu'une case ne valide pas les critères
            }
        }
    }

    // 3. Validation de la règle d'assèchement
    // On calcule la quantité restante chez l'adversaire après capture potentielle
    let oppStart = (currentPlayer === "South") ? 7 : 0;
    let oppRemaining = 0;
    for (let i = oppStart; i < oppStart + 7; i++) {
        oppRemaining += tempBoard[i];
    }

    // Si le coup laisse l'adversaire sans aucune graine, la capture est annulée (Interdit d'assécher)
    if (oppRemaining === 0 && capturedSeeds > 0) {
        displayMessage("Coup interdit : Vous ne pouvez pas assécher l'adversaire ! (Capture annulée)");
        // On applique le coup MAIS sans récolter les graines (elles restent sur le plateau)
        // On doit donc recalculer la distribution sans la phase de mise à zéro des cases capturées
        executeMove(index, false); 
    } else {
        // Le coup et ses captures sont totalement valides, on applique l'état simulé
        board = tempBoard;
        if (currentPlayer === "South") scoreSouth += capturedSeeds;
        else scoreNorth += scoreNorth += capturedSeeds;
        displayMessage(capturedSeeds > 0 ? `Récolte réussie : +${capturedSeeds} graines !` : "");
        
        // Si le coup a consommé un grenier à exactement 14 graines, la capture bonus est déjà incluse
        if(board[index] > 13 && (board[index] - 13 === 1)) {
             if (currentPlayer === "South") scoreSouth += 1;
             else scoreNorth += 1;
        }
    }

    // Fin du tour : changement de joueur et vérification de victoire
    switchPlayer();
    renderBoard();
    checkWinner();
}

// Permet d'exécuter un coup classique sans captures (utilisé en cas d'annulation anti-assèchement)
function executeMove(index, allowCapture) {
    let seeds = board[index];
    board[index] = 0;
    let current = index;

    if (seeds > 13) {
        for (let t = 0; t < 13; t++) {
            current = nextPit(current);
            board[current]++;
            seeds--;
        }
        if (seeds === 1) {
            if (currentPlayer === "South") scoreSouth++;
            else scoreNorth++;
            seeds--;
        } else if (seeds > 1) {
            let oppOrder = (currentPlayer === "South") ? [13, 12, 11, 10, 9, 8, 7] : [6, 5, 4, 3, 2, 1, 0];
            let oppIdx = 0;
            while (seeds > 0) {
                board[oppOrder[oppIdx % 7]]++;
                seeds--;
                oppIdx++;
            }
        }
    } else {
        while (seeds > 0) {
            current = nextPit(current);
            board[current]++;
            seeds--;
        }
    }
}

function switchPlayer() {
    currentPlayer = (currentPlayer === "South") ? "North" : "South";
}

function displayMessage(txt) {
    message.textContent = txt;
}

function checkWinner() {
    // Le jeu s'arrête dès qu'un joueur atteint ou dépasse le seuil fatidique de 40 graines capturées
    if (scoreSouth >= 40) {
        displayMessage("Victoire ! Le joueur SUD gagne la partie avec " + scoreSouth + " graines !");
        gameOver = true;
    } else if (scoreNorth >= 40) {
        displayMessage("Victoire ! Le joueur NORD gagne la partie avec " + scoreNorth + " graines !");
        gameOver = true;
    } else {
        // Optionnel : Fin de partie si aucun joueur ne peut plus nourrir l'autre (blocage total)
        if (countCampSeeds("South") === 0 && countCampSeeds("North") === 0) {
            displayMessage("Match nul ! Plus aucune graine disponible sur le plateau.");
            gameOver = true;
        }
    }
}


// Initialisation au chargement du script
renderBoard();
const resetBtn = document.getElementById("resetBtn");
let resetPromptActive = false; // Pour éviter d'afficher l'alerte en boucle à chaque polling

// 1. LE DEMANDEUR CLIQUE SUR LE BOUTON
resetBtn.onclick = async () => {
    try {
        displayMessage("Demande de réinitialisation envoyée à l'adversaire...");
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
        displayMessage("Erreur de connexion.");
    }
};

// 2. GESTION DES RÉPONSES AUX DEMANDES (ACCEPTATION / REFUS)
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
        console.error(error);
    }
}

// 3. MISE À JOUR DE L'ÉTAT DU JEU (Modifiée pour écouter le Reset)
function updateState(data) {
    board = data.board;
    scoreSouth = data.scoreSouth;
    scoreNorth = data.scoreNorth;
    currentPlayer = data.currentPlayer;
    gameOver = data.gameOver;

    if (data.message) displayMessage(data.message);

    // ANALYSE DU STATUT DE RECONVERSION DU SERVEUR
    if (data.resetStatus) {
        const reqBy = data.resetStatus.requestedBy;
        const status = data.resetStatus.status;

        // Cas où c'est l'ADVERSAIRE qui demande et que c'est en attente (pending)
        if (reqBy !== playerRole && status === "pending" && !resetPromptActive) {
            resetPromptActive = true; // On bloque les autres alertes
            setTimeout(() => { // Un court délai pour laisser l'interface respirer
                let accept = confirm("Ton adversaire demande de recommencer la partie ! \n\n[Ok] pour Accepter\n[Annuler] pour Refuser");
                if (accept) {
                    sendResetResponse("accept_reset");
                } else {
                    sendResetResponse("refuse_reset");
                }
                resetPromptActive = false;
            }, 100);
        }

        // Cas où le demandeur voit que l'autre a REFUSÉ
        if (reqBy === playerRole && status === "refused") {
            alert("Ton adversaire a refusé de recommencer la partie !");
            // On demande au serveur de nettoyer le statut de refus pour pouvoir rejouer ou redemander plus tard
            sendResetResponse("clear_refusal");
        }
    }

    renderBoard();
}
