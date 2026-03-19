// Admin Panel JavaScript
class AdminPanel {
    constructor() {
        this.currentSection = 'overview';
        this.web3 = null;
        this.contract = null;
        this.walletAddress = null;
        this.payrollQueue = [];
        this.selectedPayouts = new Set();
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initWeb3();
        this.showSection('overview');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('[data-section]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showSection(e.target.dataset.section);
            });
        });

        // Wallet connection
        document.getElementById('connectWallet').addEventListener('click', () => {
            this.connectWallet();
        });

        // Payroll actions
        document.getElementById('refreshPayroll').addEventListener('click', () => {
            this.loadPayrollQueue();
        });

        document.getElementById('selectAllPayouts').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        document.getElementById('batchSettle').addEventListener('click', () => {
            this.batchSettle();
        });

        document.getElementById('exportPayroll').addEventListener('click', () => {
            this.exportPayrollData();
        });

        // Search and filter
        document.getElementById('payrollSearch').addEventListener('input', (e) => {
            this.filterPayrollTable(e.target.value);
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filterByStatus(e.target.value);
        });
    }

    async initWeb3() {
        if (typeof window.ethereum !== 'undefined') {
            this.web3 = new Web3(window.ethereum);
            // Initialize contract here
            this.contract = new this.web3.eth.Contract(BNUT_ABI, BNUT_CONTRACT_ADDRESS);
        }
    }

    async connectWallet() {
        try {
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
            this.walletAddress = accounts[0];
            
            document.getElementById('walletStatus').innerHTML = `
                <span class="wallet-connected">
                    <i class="fas fa-wallet"></i>
                    ${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(38)}
                </span>
            `;
            
            document.getElementById('connectWallet').style.display = 'none';
            
            // Load payroll data after wallet connection
            if (this.currentSection === 'payroll') {
                this.loadPayrollQueue();
            }
            
        } catch (error) {
            console.error('Wallet connection failed:', error);
            this.showNotification('Failed to connect wallet', 'error');
        }
    }

    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.admin-section').forEach(section => {
            section.classList.remove('active');
        });

        // Show selected section
        document.getElementById(`${sectionName}Section`).classList.add('active');

        // Update navigation
        document.querySelectorAll('[data-section]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        this.currentSection = sectionName;

        // Load section-specific data
        if (sectionName === 'payroll' && this.walletAddress) {
            this.loadPayrollQueue();
        }
    }

    async loadPayrollQueue() {
        try {
            document.getElementById('loadingPayroll').style.display = 'block';
            
            // Simulate API call to get payroll data
            const response = await fetch('/api/admin/payroll', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            this.payrollQueue = await response.json();
            this.renderPayrollTable();
            this.updatePayrollStats();
            
        } catch (error) {
            console.error('Failed to load payroll queue:', error);
            this.showNotification('Failed to load payroll data', 'error');
        } finally {
            document.getElementById('loadingPayroll').style.display = 'none';
        }
    }

    renderPayrollTable() {
        const tbody = document.getElementById('payrollTableBody');
        tbody.innerHTML = '';

        this.payrollQueue.forEach(payout => {
            const row = document.createElement('tr');
            row.className = payout.status === 'pending' ? 'pending' : 'settled';
            
            row.innerHTML = `
                <td>
                    <input type="checkbox" 
                           class="payout-checkbox" 
                           value="${payout.id}"
                           ${payout.status === 'settled' ? 'disabled' : ''}
                           onchange="admin.togglePayoutSelection('${payout.id}', this.checked)">
                </td>
                <td>
                    <div class="user-info">
                        <img src="${payout.user.avatar || '/images/default-avatar.png'}" 
                             alt="Avatar" class="user-avatar">
                        <div>
                            <div class="username">${payout.user.username}</div>
                            <div class="wallet-address">${this.formatAddress(payout.user.walletAddress)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="bounty-info">
                        <div class="bounty-title">${payout.bounty.title}</div>
                        <div class="bounty-id">#${payout.bounty.id}</div>
                    </div>
                </td>
                <td class="amount-cell">
                    <span class="bnut-amount">${payout.amount} BNUT</span>
                    <div class="usd-value">~$${(payout.amount * 0.1).toFixed(2)}</div>
                </td>
                <td>
                    <span class="status-badge ${payout.status}">
                        ${payout.status.toUpperCase()}
                    </span>
                </td>
                <td class="date-cell">
                    ${new Date(payout.createdAt).toLocaleDateString()}
                </td>
                <td>
                    <div class="action-buttons">
                        ${payout.status === 'pending' ? `
                            <button class="btn-icon settle-single" 
                                    onclick="admin.settleSingle('${payout.id}')"
                                    title="Settle Payment">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        ` : `
                            <a href="https://etherscan.io/tx/${payout.txHash}" 
                               target="_blank" 
                               class="btn-icon view-tx"
                               title="View Transaction">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        `}
                        <button class="btn-icon view-details" 
                                onclick="admin.showPayoutDetails('${payout.id}')"
                                title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    updatePayrollStats() {
        const pending = this.payrollQueue.filter(p => p.status === 'pending');
        const settled = this.payrollQueue.filter(p => p.status === 'settled');
        
        const totalPending = pending.reduce((sum, p) => sum + p.amount, 0);
        const totalSettled = settled.reduce((sum, p) => sum + p.amount, 0);
        
        document.getElementById('totalPendingAmount').textContent = `${totalPending.toLocaleString()} BNUT`;
        document.getElementById('totalSettledAmount').textContent = `${totalSettled.toLocaleString()} BNUT`;
        document.getElementById('pendingPayoutsCount').textContent = pending.length;
        document.getElementById('settledPayoutsCount').textContent = settled.length;
    }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.payout-checkbox:not(:disabled)');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            this.togglePayoutSelection(checkbox.value, checked);
        });
    }

    togglePayoutSelection(payoutId, selected) {
        if (selected) {
            this.selectedPayouts.add(payoutId);
        } else {
            this.selectedPayouts.delete(payoutId);
        }
        
        this.updateBatchSettleButton();
    }

    updateBatchSettleButton() {
        const batchSettleBtn = document.getElementById('batchSettle');
        const selectedCount = this.selectedPayouts.size;
        
        if (selectedCount > 0) {
            batchSettleBtn.disabled = false;
            batchSettleBtn.innerHTML = `
                <i class="fas fa-paper-plane"></i>
                Settle ${selectedCount} Payment${selectedCount > 1 ? 's' : ''}
            `;
        } else {
            batchSettleBtn.disabled = true;
            batchSettleBtn.innerHTML = `
                <i class="fas fa-paper-plane"></i>
                Batch Settle
            `;
        }
    }

    async batchSettle() {
        if (this.selectedPayouts.size === 0) return;
        
        const selectedPayouts = this.payrollQueue.filter(p => 
            this.selectedPayouts.has(p.id)
        );
        
        const totalAmount = selectedPayouts.reduce((sum, p) => sum + p.amount, 0);
        
        const confirmed = confirm(
            `Settle ${this.selectedPayouts.size} payment(s) totaling ${totalAmount} BNUT?\n\n` +
            `This will execute blockchain transactions and cannot be undone.`
        );
        
        if (!confirmed) return;
        
        try {
            document.getElementById('batchSettle').disabled = true;
            document.getElementById('batchSettle').innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Processing...
            `;
            
            // Process settlements
            for (const payout of selectedPayouts) {
                await this.processSettlement(payout);
            }
            
            this.showNotification(
                `Successfully settled ${this.selectedPayouts.size} payment(s)`, 
                'success'
            );
            
            this.selectedPayouts.clear();
            this.loadPayrollQueue();
            
        } catch (error) {
            console.error('Batch settlement failed:', error);
            this.showNotification('Batch settlement failed', 'error');
        } finally {
            this.updateBatchSettleButton();
        }
    }

    async settleSingle(payoutId) {
        const payout = this.payrollQueue.find(p => p.id === payoutId);
        if (!payout) return;
        
        const confirmed = confirm(
            `Settle payment of ${payout.amount} BNUT to ${payout.user.username}?\n\n` +
            `This will execute a blockchain transaction and cannot be undone.`
        );
        
        if (!confirmed) return;
        
        try {
            await this.processSettlement(payout);
            this.showNotification('Payment settled successfully', 'success');
            this.loadPayrollQueue();
            
        } catch (error) {
            console.error('Settlement failed:', error);
            this.showNotification('Settlement failed', 'error');
        }
    }

    async processSettlement(payout) {
        try {
            // Convert BNUT to Wei (assuming 18 decimals)
            const amountWei = this.web3.utils.toWei(payout.amount.toString(), 'ether');
            
            // Execute token transfer
            const txHash = await this.contract.methods
                .transfer(payout.user.walletAddress, amountWei)
                .send({ from: this.walletAddress });
            
            // Update backend
            await fetch(`/api/admin/payroll/${payout.id}/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({ txHash })
            });
            
            return txHash;
            
        } catch (error) {
            throw new Error(`Settlement failed: ${error.message}`);
        }
    }

    filterPayrollTable(searchTerm) {
        const rows = document.querySelectorAll('#payrollTableBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const matches = text.includes(searchTerm.toLowerCase());
            row.style.display = matches ? '' : 'none';
        });
    }

    filterByStatus(status) {
        const rows = document.querySelectorAll('#payrollTableBody tr');
        
        rows.forEach(row => {
            if (status === 'all') {
                row.style.display = '';
            } else {
                const statusBadge = row.querySelector('.status-badge');
                const matches = statusBadge.textContent.toLowerCase() === status;
                row.style.display = matches ? '' : 'none';
            }
        });
    }

    showPayoutDetails(payoutId) {
        const payout = this.payrollQueue.find(p => p.id === payoutId);
        if (!payout) return;
        
        const modal = document.getElementById('payoutDetailsModal');
        const content = document.getElementById('payoutDetailsContent');
        
        content.innerHTML = `
            <div class="payout-details">
                <div class="detail-group">
                    <h4>User Information</h4>
                    <div class="detail-item">
                        <span class="label">Username:</span>
                        <span class="value">${payout.user.username}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Wallet Address:</span>
                        <span class="value">${payout.user.walletAddress}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Email:</span>
                        <span class="value">${payout.user.email}</span>
                    </div>
                </div>
                
                <div class="detail-group">
                    <h4>Bounty Information</h4>
                    <div class="detail-item">
                        <span class="label">Title:</span>
                        <span class="value">${payout.bounty.title}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">ID:</span>
                        <span class="value">#${payout.bounty.id}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Category:</span>
                        <span class="value">${payout.bounty.category}</span>
                    </div>
                </div>
                
                <div class="detail-group">
                    <h4>Payment Details</h4>
                    <div class="detail-item">
                        <span class="label">Amount:</span>
                        <span class="value">${payout.amount} BNUT</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Status:</span>
                        <span class="value">
                            <span class="status-badge ${payout.status}">${payout.status.toUpperCase()}</span>
                        </span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Created:</span>
                        <span class="value">${new Date(payout.createdAt).toLocaleString()}</span>
                    </div>
                    ${payout.settledAt ? `
                        <div class="detail-item">
                            <span class="label">Settled:</span>
                            <span class="value">${new Date(payout.settledAt).toLocaleString()}</span>
                        </div>
                    ` : ''}
                    ${payout.txHash ? `
                        <div class="detail-item">
                            <span class="label">Transaction:</span>
                            <span class="value">
                                <a href="https://etherscan.io/tx/${payout.txHash}" target="_blank">
                                    ${this.formatAddress(payout.txHash)}
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    exportPayrollData() {
        const csvContent = this.generateCSV();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `payroll_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    generateCSV() {
        const headers = ['ID', 'Username', 'Wallet Address', 'Bounty Title', 'Amount (BNUT)', 'Status', 'Created', 'TX Hash'];
        const rows = this.payrollQueue.map(payout => [
            payout.id,
            payout.user.username,
            payout.user.walletAddress,
            payout.bounty.title,
            payout.amount,
            payout.status,
            new Date(payout.createdAt).toLocaleString(),
            payout.txHash || ''
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
            
        return csvContent;
    }

    formatAddress(address) {
        if (!address) return 'N/A';
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
        `;
        
        document.getElementById('notifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize admin panel
const admin = new AdminPanel();

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('payoutDetailsModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Close modal with escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('payoutDetailsModal');
        if (modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    }
});