const boardDiv = document.getElementById("board");

const scoreNorthElement =
document.getElementById("scoreNorth");

const scoreSouthElement =
document.getElementById("scoreSouth");

const currentPlayerElement =
document.getElementById("currentPlayer");

const message =
document.getElementById("message");

let board = new Array(14).fill(5);

let currentPlayer = "South";

let scoreNorth = 0;
let scoreSouth = 0;

function renderBoard()
{
boardDiv.innerHTML = "";

for(let i=6;i>=0;i--)
{
createCell(i,true);
}

for(let i=7;i<14;i++)
{
createCell(i,false);
}

scoreNorthElement.textContent =
scoreNorth;

scoreSouthElement.textContent =
scoreSouth;

currentPlayerElement.textContent =
currentPlayer === "South"
? "Sud"
: "Nord";
}

function createCell(index,north)
{
const cell = document.createElement("div");

cell.classList.add("cell");

cell.classList.add(
north ? "north" : "south"
);

cell.textContent = board[index];

cell.onclick = () =>
{
play(index);
};

boardDiv.appendChild(cell);
}

function isPlayerPit(index)
{
if(currentPlayer==="South")
return index>=7;

return index<=6;
}

function nextPit(index)
{
return (index+1)%14;
}

function play(index)
{
if(!isPlayerPit(index))
return;

if(board[index]===0)
return;

let seeds = board[index];

board[index]=0;

let current = index;

while(seeds>0)
{
current = nextPit(current);

board[current]++;

seeds--;
}

capture(current);

switchPlayer();

renderBoard();

checkWinner();
}

function capture(lastPit)
{
if(currentPlayer==="South")
{
if(lastPit<7)
{
let i = lastPit;

while(i>=0)
{
if(board[i]>=2 &&
board[i]<=4)
{
scoreSouth += board[i];

board[i]=0;

i--;
}
else
{
break;
}
}
}
}
else
{
if(lastPit>=7)
{
let i = lastPit;

while(i<14)
{
if(board[i]>=2 &&
board[i]<=4)
{
scoreNorth += board[i];

board[i]=0;

i++;
}
else
{
break;
}
}
}
}
}

function switchPlayer()
{
currentPlayer =
currentPlayer==="South"
? "North"
: "South";
}

function checkWinner()
{
if(scoreSouth>=40)
{
message.textContent =
"Le joueur Sud gagne !";
}

if(scoreNorth>=40)
{
message.textContent =
"Le joueur Nord gagne !";
}
}

renderBoard();