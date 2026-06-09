<?php
// Configuration des en-têtes CORS pour autoriser les requêtes AJAX multi-domaines
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json");

// Gestion de la requête de pré-vérification (OPTIONS) des navigateurs
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Chemin du fichier texte servant de base de données temporaire
$file_path = "gameState.json";

// Initialisation automatique de la partie lors du tout premier appel
if (!file_exists($file_path)) {
    reset_game_state($file_path);
}

$method = $_SERVER['REQUEST_METHOD'];

// -------------------------------------------------------------------------
// CAS 1 : L'adversaire demande l'état du jeu (GET - Polling AJAX toutes les 2s)
// -------------------------------------------------------------------------
if ($method === 'GET') {
    echo file_get_contents($file_path);
    exit;
}

// -------------------------------------------------------------------------
// CAS 2 : Actions sur le jeu ou demandes de Reset (POST)
// -------------------------------------------------------------------------
if ($method === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $gameState = json_decode(file_get_contents($file_path), true);

    // ---------------------------------------------------------------------
    // SOUS-CAS A : GESTION DU SYSTÈME DE RESET PAR CONSENSUS
    // ---------------------------------------------------------------------
    if ($input && isset($input['action'])) {
        $action = $input['action'];
        $player = $input['player'];

        // Étape 1 : Un joueur demande à recommencer
        if ($action === 'request_reset') {
            $gameState['resetStatus'] = [
                "requestedBy" => $player,
                "status" => "pending"
            ];
            $gameState['message'] = "Le joueur " . ($player === "South" ? "Sud" : "Nord") . " demande à recommencer la partie...";
            file_put_contents($file_path, json_encode($gameState));
            echo json_encode($gameState);
            exit;
        }

        // Étape 2 : L'adversaire accepte le reset
        if ($action === 'accept_reset') {
            $newState = reset_game_state($file_path);
            echo json_encode($newState);
            exit;
        }

        // Étape 3 : L'adversaire refuse le reset
        if ($action === 'refuse_reset') {
            $gameState['resetStatus'] = [
                "requestedBy" => $gameState['resetStatus']['requestedBy'],
                "status" => "refused"
            ];
            $gameState['message'] = "Le joueur " . ($player === "South" ? "Sud" : "Nord") . " a refusé de recommencer la partie.";
            file_put_contents($file_path, json_encode($gameState));
            echo json_encode($gameState);
            exit;
        }

        // Étape 4 : Le demandeur efface la notification de refus après l'avoir vue
        if ($action === 'clear_refusal') {
            unset($gameState['resetStatus']);
            file_put_contents($file_path, json_encode($gameState));
            echo json_encode($gameState);
            exit;
        }
    }

    // ---------------------------------------------------------------------
    // SOUS-CAS B : LOGIQUE D'UN COUP DE JEU STANDARD
    // ---------------------------------------------------------------------
    if (!$input || !isset($input['player']) || !isset($input['pitIndex'])) {
        http_response_code(400);
        echo json_encode(["error" => "Données de requête incomplètes."]);
        exit;
    }

    $player = $input['player'];
    $pitIndex = intval($input['pitIndex']);

    // Sécurité : Bloquer les clics si la partie est finie
    if ($gameState['gameOver']) {
        echo json_encode($gameState);
        exit;
    }

    // Sécurité : Vérifier que c'est bien au tour de ce joueur de jouer
    if ($player !== $gameState['currentPlayer']) {
        http_response_code(400);
        echo json_encode(["error" => "Ce n'est pas votre tour d'attendre !"]);
        exit;
    }

    $board = $gameState['board'];

    // RÈGLE DE SOLIDARITÉ : Si l'adversaire est à sec (0 graine), on doit jouer sa case MAX
    $opponent = ($player === "South") ? "North" : "South";
    if (countCampSeeds($board, $opponent) === 0) {
        $maxSeeds = getMaxSeedsInCamp($board, $player);
        if ($board[$pitIndex] < $maxSeeds) {
            http_response_code(400);
            echo json_encode(["error" => "Règle de solidarité ! Vous devez jouer votre case contenant le maximum de graines pour nourrir l'adversaire."]);
            exit;
        }
    }

    // --- SIMULATION DU COUP (Pour tester la validité des règles) ---
    $tempBoard = $board;
    $tempScoreSouth = $gameState['scoreSouth'];
    $tempScoreNorth = $gameState['scoreNorth'];
    
    $seeds = $tempBoard[$pitIndex];
    $tempBoard[$pitIndex] = 0;
    $current = $pitIndex;

    // Règle du GRENIER / NDÀ (> 13 graines dans la case de départ)
    if ($seeds > 13) {
        // 1er tour complet obligatoire (1 graine dans les 13 autres cases)
        for ($t = 0; $t < 13; $t++) {
            $current = ($current - 1 + 14) % 14; // Sens des aiguilles d'une montre
            $tempBoard[$current]++;
            $seeds--;
        }
        // Si 14 graines au départ, la 14ème est capturée directement (Automatique)
        if ($seeds === 1) {
            if ($player === "South") $tempScoreSouth++; else $tempScoreNorth++;
            $seeds--;
        } else if ($seeds > 1) {
            // Si plus de 14 graines, le surplus va EXCLUSIVEMENT chez l'adversaire
            $oppOrder = ($player === "South") ? [13, 12, 11, 10, 9, 8, 7] : [6, 5, 4, 3, 2, 1, 0];
            $oppIdx = 0;
            while ($seeds > 0) {
                $target = $oppOrder[$oppIdx % 7];
                $tempBoard[$target]++;
                $current = $target;
                $seeds--;
                $oppIdx++;
            }
        }
    } else {
        // Distribution classique (Sens horaire)
        while ($seeds > 0) {
            $current = ($current - 1 + 14) % 14;
            $tempBoard[$current]++;
            $seeds--;
        }
    }

    // Calcul de la rafle (captures contiguës en remontant)
    $capturedSeeds = 0;
    $checkPit = $current;
    $isOpponentPit = ($player === "South") ? ($checkPit >= 7) : ($checkPit <= 6);

    if ($isOpponentPit) {
        while ($isOpponentPit) {
            // Restriction Songo : Interdiction de capturer sur les cases d'extrémités (N0 = 13, S6 = 6)
            if ($player === "South" && $checkPit === 13) break;
            if ($player === "North" && $checkPit === 6) break;

            // Une case est capturable s'il y a 2, 3 ou 4 graines APRÈS dépôt
            if ($tempBoard[$checkPit] >= 2 && $tempBoard[$checkPit] <= 4) {
                $capturedSeeds += $tempBoard[$checkPit];
                $tempBoard[$checkPit] = 0;
                
                // On remonte à reculons (sens inverse de la distribution)
                $checkPit = ($checkPit + 1) % 14;
                $isOpponentPit = ($player === "South") ? ($checkPit >= 7) : ($checkPit <= 6);
            } else {
                break; // Interruption immédiate de la rafle dès qu'une case ne remplit pas le critère
            }
        }
    }

    // RÈGLE ANTI-ASSÈCHEMENT : On vérifie si la capture laisse l'adversaire complètement à sec
    $oppStart = ($player === "South") ? 7 : 0;
    $oppRemaining = 0;
    for ($i = $oppStart; $i < $oppStart + 7; $i++) {
        $oppRemaining += $tempBoard[$i];
    }

    $actionMessage = "";
    if ($oppRemaining === 0 && $capturedSeeds > 0) {
        // Coup autorisé MAIS capture annulée pour ne pas affamer l'adversaire
        $actionMessage = ($player === "South" ? "Sud" : "Nord") . " a joué. Capture annulée : Interdit d'assécher l'adversaire !";
        // On réexécute la distribution propre sans enlever les graines du plateau
        $board = executeMoveWithoutCapture($board, $pitIndex, $player, $gameState['scoreSouth'], $gameState['scoreNorth']);
    } else {
        // Le coup et ses captures associées sont valides
        $board = $tempBoard;
        if ($player === "South") $gameState['scoreSouth'] += $capturedSeeds;
        else $gameState['scoreNorth'] += $capturedSeeds;
        
        // Validation finale du point bonus automatique du Grenier si initialement à 14 graines
        if ($board[$pitIndex] > 13 && ($board[$pitIndex] - 13 === 1)) {
            if ($player === "South") $gameState['scoreSouth']++; else $gameState['scoreNorth']++;
        }

        $actionMessage = ($player === "South" ? "Sud" : "Nord") . " a joué en case " . $pitIndex;
        if ($capturedSeeds > 0) {
            $actionMessage .= " et a récolté " . $capturedSeeds . " graines !";
        }
    }

    // Enregistrement de l'état modifié
    $gameState['board'] = $board;
    $gameState['currentPlayer'] = ($player === "South") ? "North" : "South";
    $gameState['message'] = $actionMessage;

    // Conditions de victoire (Seuil réglementaire fixé à 40 graines capturées)
    if ($gameState['scoreSouth'] >= 40) {
        $gameState['gameOver'] = true;
        $gameState['message'] = "Victoire ! Le joueur SUD a gagné la partie avec " . $gameState['scoreSouth'] . " graines !";
    } elseif ($gameState['scoreNorth'] >= 40) {
        $gameState['gameOver'] = true;
        $gameState['message'] = "Victoire ! Le joueur NORD a gagné la partie avec " . $gameState['scoreNorth'] . " graines !";
    }

    // Sauvegarde définitive dans le fichier JSON
    file_put_contents($file_path, json_encode($gameState));

    echo json_encode($gameState);
    exit;
}

// -------------------------------------------------------------------------
// FONCTIONS STRUCTURELLES ET ALGORITHMES COMPLÉMENTAIRES
// -------------------------------------------------------------------------

// Réinitialisation globale de l'état du jeu
function reset_game_state($file_path) {
    $initialState = [
        "board" => array_fill(0, 14, 5),
        "currentPlayer" => "South",
        "scoreSouth" => 0,
        "scoreNorth" => 0,
        "gameOver" => false,
        "message" => "La partie commence / redémarre ! Sud, à vous de jouer."
    ];
    file_put_contents($file_path, json_encode($initialState));
    return $initialState;
}

// Compte la totalité des graines dans le camp ciblé
function countCampSeeds($board, $player) {
    $start = ($player === "South") ? 0 : 7;
    $sum = 0;
    for ($i = $start; $i < $start + 7; $i++) { 
        $sum += $board[$i]; 
    }
    return $sum;
}

// Recherche le nombre maximum de graines présentes dans une unique case d'un camp
function getMaxSeedsInCamp($board, $player) {
    $start = ($player === "South") ? 0 : 7;
    $max = 0;
    for ($i = $start; $i < $start + 7; $i++) { 
        if ($board[$i] > $max) $max = $board[$i]; 
    }
    return $max;
}

// Effectue une distribution à blanc sans appliquer le retrait des captures (Cas anti-assèchement)
function executeMoveWithoutCapture($board, $index, $player, &$scoreSouth, &$scoreNorth) {
    $seeds = $board[$index];
    $board[$index] = 0;
    $current = $index;

    if ($seeds > 13) {
        for ($t = 0; $t < 13; $t++) {
            $current = ($current - 1 + 14) % 14;
            $board[$current]++;
            $seeds--;
        }
        if ($seeds === 1) {
            if ($player === "South") $scoreSouth++; else $scoreNorth++;
            $seeds--;
        } else if ($seeds > 1) {
            $oppOrder = ($player === "South") ? [13, 12, 11, 10, 9, 8, 7] : [6, 5, 4, 3, 2, 1, 0];
            $oppIdx = 0;
            while ($seeds > 0) {
                $board[$oppOrder[$oppIdx % 7]]++;
                $seeds--;
                $oppIdx++;
            }
        }
    } else {
        while ($seeds > 0) {
            $current = ($current - 1 + 14) % 14;
            $board[$current]++;
            $seeds--;
        }
    }
    return $board;
}
?>
