class AdminPanel {
    constructor() {
        this.web3 = null;
        this.contract = null;
        this.userAccount = null;
        this.payrollQueue = [];
        this.init();
    }

    async init() {
        await this.loadWeb3();
        await this.loadContract();
        this.initializeElements();
        this.bindEvents();
        await this.loadPayrollQueue();
    }

    async loadWeb3() {
        if (window.ethereum) {
            this.web3 = new Web3(window.ethereum);
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                this.userAccount = accounts[0];
                console.log('Connected account:', this.userAccount);
            } catch (error) {
                console.error('User denied account access');
            }
        } else {
            console.error('MetaMask not found');
        }
    }

    async loadContract() {
        try {
            const contractAddress = '0x...'; // Replace with actual contract address
            const contractABI = [
                {
                    "inputs": [
                        {"name": "to", "type": "address"},
                        {"name": "amount", "type": "uint256"}
                    ],
                    "name": "mintReward",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ];
            
            this.contract = new this.web3.eth.Contract(contractABI, contractAddress);
        } catch (error) {
            console.error('Error loading contract:', error);
        }
    }

    initializeElements() {
        this.payrollSection = document.getElementById('payroll-section');
        this.payrollTable = document.getElementById('payroll-table');
        this.payrollTableBody = document.getElementById('payroll-table-body');
        this.refreshBtn = document.getElementById('refresh-payroll');
        this.bulkSettleBtn = document.getElementById('bulk-settle');
        this.connectionStatus = document.getElementById('connection-status');
        
        this.updateConnectionStatus();
    }

    bindEvents() {
        this.refreshBtn?.addEventListener('click', () => this.loadPayrollQueue());
        this.bulkSettleBtn?.addEventListener('click', () => this.bulkSettlePayroll());
        
        // MetaMask account change listener
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                this.userAccount = accounts[0];
                this.updateConnectionStatus();
            });
        }
    }

    updateConnectionStatus() {
        if (this.connectionStatus) {
            if (this.userAccount) {
                this.connectionStatus.innerHTML = `
                    <span class="status-connected">
                        <i class="fas fa-check-circle"></i>
                        Connected: ${this.userAccount.substring(0, 6)}...${this.userAccount.substring(38)}
                    </span>
                `;
                this.connectionStatus.className = 'connection-status connected';
            } else {
                this.connectionStatus.innerHTML = `
                    <span class="status-disconnected">
                        <i class="fas fa-exclamation-circle"></i>
                        Not Connected
                    </span>
                `;
                this.connectionStatus.className = 'connection-status disconnected';
            }
        }
    }

    async loadPayrollQueue() {
        try {
            // Simulate API call to get payroll queue
            const response = await fetch('/api/admin/payroll-queue');
            this.payrollQueue = await response.json();
            
            this.renderPayrollTable();
        } catch (error) {
            console.error('Error loading payroll queue:', error);
            this.showNotification('Error loading payroll queue', 'error');
        }
    }

    renderPayrollTable() {
        if (!this.payrollTableBody) return;

        this.payrollTableBody.innerHTML = '';

        if (this.payrollQueue.length === 0) {
            this.payrollTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data">No pending payroll items</td>
                </tr>
            `;
            return;
        }

        this.payrollQueue.forEach(item => {
            const row = document.createElement('tr');
            row.className = `payroll-row status-${item.status}`;
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="payroll-checkbox" data-id="${item.id}" 
                           ${item.status === 'settled' ? 'disabled' : ''}>
                </td>
                <td>
                    <div class="user-info">
                        <strong>${item.username}</strong>
                        <br>
                        <small class="wallet-address">${item.walletAddress}</small>
                    </div>
                </td>
                <td>
                    <span class="task-title">${item.taskTitle}</span>
                    <br>
                    <small class="task-id">#${item.taskId}</small>
                </td>
                <td>
                    <input type="number" 
                           class="amount-input" 
                           data-id="${item.id}" 
                           value="${item.amount}" 
                           min="0" 
                           step="0.01"
                           ${item.status === 'settled' ? 'disabled' : ''}>
                </td>
                <td>
                    <span class="status-badge status-${item.status}">
                        ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                </td>
                <td>
                    <span class="date-created">${new Date(item.createdAt).toLocaleDateString()}</span>
                </td>
                <td class="actions">
                    ${item.status !== 'settled' ? `
                        <button class="btn btn-primary btn-sm settle-btn" 
                                data-id="${item.id}"
                                onclick="adminPanel.settlePayroll('${item.id}')">
                            <i class="fas fa-coins"></i> Settle
                        </button>
                    ` : `
                        <span class="settled-indicator">
                            <i class="fas fa-check-circle"></i> Settled
                        </span>
                    `}
                </td>
            `;
            
            this.payrollTableBody.appendChild(row);
        });

        // Bind amount change events
        this.bindAmountChangeEvents();
    }

    bindAmountChangeEvents() {
        const amountInputs = document.querySelectorAll('.amount-input');
        amountInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const newAmount = parseFloat(e.target.value) || 0;
                this.updatePayrollAmount(id, newAmount);
            });
        });
    }

    async updatePayrollAmount(id, amount) {
        try {
            const response = await fetch(`/api/admin/payroll/${id}/amount`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount })
            });

            if (!response.ok) {
                throw new Error('Failed to update amount');
            }

            // Update local data
            const item = this.payrollQueue.find(item => item.id === id);
            if (item) {
                item.amount = amount;
            }

            this.showNotification('Amount updated successfully', 'success');
        } catch (error) {
            console.error('Error updating amount:', error);
            this.showNotification('Error updating amount', 'error');
        }
    }

    async settlePayroll(id) {
        if (!this.userAccount) {
            this.showNotification('Please connect your MetaMask wallet', 'error');
            return;
        }

        const item = this.payrollQueue.find(item => item.id === id);
        if (!item) {
            this.showNotification('Payroll item not found', 'error');
            return;
        }

        try {
            this.showLoading(`Settling payment for ${item.username}...`);
            
            // Convert amount to wei (assuming 18 decimals for $BNUT token)
            const amountWei = this.web3.utils.toWei(item.amount.toString(), 'ether');
            
            // Call mintReward function
            const transaction = await this.contract.methods.mintReward(
                item.walletAddress,
                amountWei
            ).send({
                from: this.userAccount,
                gas: 200000
            });

            console.log('Transaction hash:', transaction.transactionHash);

            // Update backend with settlement
            await this.markPayrollSettled(id, transaction.transactionHash);
            
            // Refresh the table
            await this.loadPayrollQueue();
            
            this.hideLoading();
            this.showNotification(`Payment settled successfully! TX: ${transaction.transactionHash}`, 'success');
            
        } catch (error) {
            console.error('Error settling payroll:', error);
            this.hideLoading();
            this.showNotification(`Error settling payment: ${error.message}`, 'error');
        }
    }

    async markPayrollSettled(id, transactionHash) {
        try {
            const response = await fetch(`/api/admin/payroll/${id}/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    transactionHash,
                    settledBy: this.userAccount,
                    settledAt: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error('Failed to mark as settled');
            }
        } catch (error) {
            console.error('Error marking as settled:', error);
        }
    }

    async bulkSettlePayroll() {
        const checkedBoxes = document.querySelectorAll('.payroll-checkbox:checked:not([disabled])');
        
        if (checkedBoxes.length === 0) {
            this.showNotification('Please select items to settle', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to settle ${checkedBoxes.length} payroll items?`)) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const checkbox of checkedBoxes) {
            const id = checkbox.dataset.id;
            try {
                await this.settlePayroll(id);
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`Error settling payroll ${id}:`, error);
            }
            
            // Add small delay between transactions
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.showNotification(
            `Bulk settlement complete: ${successCount} successful, ${errorCount} failed`, 
            errorCount > 0 ? 'warning' : 'success'
        );
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    showLoading(message) {
        const loader = document.createElement('div');
        loader.id = 'payroll-loader';
        loader.className = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(loader);
    }

    hideLoading() {
        const loader = document.getElementById('payroll-loader');
        if (loader) {
            loader.remove();
        }
    }

    // Utility method to format amounts
    formatAmount(amount) {
        return parseFloat(amount).toFixed(2);
    }

    // Export payroll data to CSV
    exportPayrollData() {
        const csvContent = [
            ['Username', 'Wallet Address', 'Task Title', 'Amount', 'Status', 'Created Date'].join(','),
            ...this.payrollQueue.map(item => [
                item.username,
                item.walletAddress,
                item.taskTitle.replace(/,/g, ';'),
                item.amount,
                item.status,
                new Date(item.createdAt).toLocaleDateString()
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll-queue-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});

// Handle wallet connection button
document.getElementById('connect-wallet')?.addEventListener('click', async () => {
    if (window.ethereum) {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            location.reload();
        } catch (error) {
            console.error('Error connecting wallet:', error);
        }
    } else {
        alert('Please install MetaMask to use this feature');
    }
});