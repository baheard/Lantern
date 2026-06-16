# Download all IF games to public/games folder
$gamesDir = "E:\Project\Lantern\public\games"

# Create directory if it doesn't exist
if (-not (Test-Path $gamesDir)) {
    New-Item -ItemType Directory -Path $gamesDir
}

# Game URLs and their local filenames
$games = @{
    # Category 1: Your First Adventure
    "dreamhold.z8" = "https://ifarchive.org/if-archive/games/zcode/dreamhold.z8"
    "lostpig.z8" = "https://ifarchive.org/if-archive/games/zcode/LostPig.z8"
    "905.z5" = "https://ifarchive.org/if-archive/games/zcode/905.z5"
    "photopia.z5" = "https://ifarchive.org/if-archive/games/zcode/photopia.z5"

    # Category 2: Ready for More
    "leathergoddesses.z5" = "https://eblong.com/infocom/gamefiles/leathergoddesses-invclues-r4-s880405.z5"
    "wishbringer.z3" = "https://eblong.com/infocom/gamefiles/wishbringer-r69-s850920.z3"
    "theatre.z5" = "https://ifarchive.org/if-archive/games/zcode/theatre.z5"
    "galatea.zblorb" = "https://ifarchive.org/if-archive/games/zcode/Galatea.zblorb"

    # Category 3: IF Masterpieces
    "spiderandweb.z5" = "https://ifarchive.org/if-archive/games/zcode/Tangle.z5"
    "anchorhead.z8" = "https://ifarchive.org/if-archive/games/zcode/anchor.z8"
    "trinity.z4" = "https://eblong.com/infocom/gamefiles/trinity-r15-s870628.z4"
    "curses.z5" = "https://ifarchive.org/if-archive/games/zcode/curses.z5"

    # Classics
    "aisle.z5" = "https://ifarchive.org/if-archive/games/zcode/Aisle.z5"
    "allroads.z5" = "https://ifarchive.org/if-archive/games/zcode/AllRoads.z5"
    "bronze.zblorb" = "https://ifarchive.org/if-archive/games/zcode/Bronze.zblorb"
    "zork.z5" = "https://ifarchive.org/if-archive/games/zcode/zdungeon.z5"
    "edifice.z5" = "https://ifarchive.org/if-archive/games/zcode/edifice.z5"
    "jigsaw.z8" = "https://ifarchive.org/if-archive/games/zcode/Jigsaw.z8"
    "metamorphoses.z5" = "https://ifarchive.org/if-archive/games/zcode/metamorp.z5"
    "savoirfaire.zblorb" = "https://ifarchive.org/if-archive/games/zcode/Savoir-Faire.zblorb"
    "shade.z5" = "https://ifarchive.org/if-archive/games/zcode/shade.z5"
    "slouching.z5" = "https://ifarchive.org/if-archive/games/competition2003/zcode/slouch/slouch.z5"
    "sofar.z8" = "https://ifarchive.org/if-archive/games/zcode/SoFar.z8"
    "varicella.z8" = "https://ifarchive.org/if-archive/games/zcode/vgame.z8"
    "violet.zblorb" = "https://ifarchive.org/if-archive/games/zcode/Violet.zblorb"
    "weather.z5" = "https://ifarchive.org/if-archive/games/zcode/weather.z5"

    # Planetfall (recommended addition for 16 classics)
    "planetfall.z5" = "https://eblong.com/infocom/gamefiles/planetfall-r37-s851003.z5"
}

Write-Host "Downloading IF games to $gamesDir..." -ForegroundColor Cyan

foreach ($filename in $games.Keys) {
    $url = $games[$filename]
    $dest = Join-Path $gamesDir $filename

    if (Test-Path $dest) {
        Write-Host "  [SKIP] $filename (already exists)" -ForegroundColor Yellow
    } else {
        Write-Host "  [DOWN] $filename" -ForegroundColor Green
        try {
            Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
        } catch {
            Write-Host "  [FAIL] $filename - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`nDone! Games saved to $gamesDir" -ForegroundColor Cyan
Write-Host "Total files:" (Get-ChildItem $gamesDir -Filter "*.z*" | Measure-Object).Count
