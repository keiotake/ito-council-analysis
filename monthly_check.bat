@echo off
chcp 65001 > nul
cd /d "C:\Users\ka\ito-council-summary"
echo ====================================
echo みんなの伊東市 - 毎月定期チェック
echo 実行日時: %DATE% %TIME%
echo ====================================
node monthly_check.js
echo.
echo ====================================
echo 完了しました
echo ログ: logs\monthly_check_*.log
echo ====================================
pause
