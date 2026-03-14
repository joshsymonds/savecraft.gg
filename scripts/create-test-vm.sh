#!/usr/bin/env bash
# Creates a Windows 11 Azure VM for testing, with RDP pre-configured to work
# with non-Windows RDP clients (disables NLA + CredSSP requirement).
#
# Uses Windows 11 Pro (consumer) which includes WebView2 pre-installed.
# Requires Trusted Launch (vTPM + Secure Boot) for Win11 Gen2 images.
#
# Usage: ./scripts/create-test-vm.sh <password> [username]
#
# Password rules (Azure):
#   - 12-123 characters, 3 of 4: upper, lower, digit, special
#   - Avoid $, backticks, backslash (shell escaping issues)
#   - Don't use common passwords (P@ssw0rd, etc.)

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <password> [username]" >&2
  echo "  password: Required. Azure VM admin password." >&2
  echo "  username: Optional. Defaults to 'savecraft'." >&2
  exit 1
fi

RG="savecraft-test-rg"
VM="sc-test-win11"
LOCATION="eastus"
IMAGE="MicrosoftWindowsDesktop:windows-11:win11-24h2-pro:latest"
SIZE="Standard_D8s_v3"
PASS="$1"
USER="${2:-savecraft}"

echo "==> Creating resource group ($RG in $LOCATION)..."
az group create --name "$RG" --location "$LOCATION" -o none

echo "==> Creating Windows 11 Pro VM (this takes 3-5 minutes)..."
IP=$(az vm create \
  --resource-group "$RG" \
  --name "$VM" \
  --image "$IMAGE" \
  --size "$SIZE" \
  --security-type TrustedLaunch \
  --enable-secure-boot true \
  --enable-vtpm true \
  --admin-username "$USER" \
  --admin-password "$PASS" \
  --authentication-type password \
  --public-ip-sku Standard \
  --nsg-rule RDP \
  --os-disk-size-gb 128 \
  --query publicIpAddress -o tsv)

echo "==> VM created at $IP"

echo "==> Waiting for VM agent to be ready..."
for i in $(seq 1 30); do
  STATUS=$(az vm get-instance-view \
    --resource-group "$RG" \
    --name "$VM" \
    --query "instanceView.vmAgent.statuses[0].displayStatus" \
    -o tsv 2>/dev/null || echo "")
  if [[ "$STATUS" == "Ready" ]]; then
    echo "    Agent ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "    WARNING: Agent not ready after 5 minutes, proceeding anyway."
    break
  fi
  echo "    Agent status: ${STATUS:-pending} (attempt $i/30)"
  sleep 10
done

echo "==> Configuring RDP (disable NLA + CredSSP for non-Windows clients)..."
az vm run-command invoke \
  --resource-group "$RG" \
  --name "$VM" \
  --command-id RunPowerShellScript \
  --scripts '
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name UserAuthentication -Type DWord -Value 0
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name SecurityLayer -Type DWord -Value 0
    Restart-Service TermService -Force
  ' -o none

echo ""
echo "========================================="
echo " Windows 11 Pro VM ready for RDP"
echo "========================================="
echo " IP:       $IP"
echo " User:     $USER"
echo " Password: $PASS"
echo ""
echo " To delete:"
echo "   az group delete --name $RG --yes --no-wait"
echo "========================================="
