// Admin payroll functionality
class AdminPayroll {
    constructor() {
        this.web3 = null;
        this.contract = null;
        this.userAccount = null;
        this.payrollQueue = [];
        this.init();
    }

    async init() {
        await this.loadPayrollQueue();
        this.renderPayrollTable();
        this.setupEventListeners();
    }

    async connectMetaMask() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                this.web3 = new Web3(window.ethereum);
                const accounts = await this.web3.eth.getAccounts();
                this.userAccount = accounts[0];
                
                // Initialize contract
                const contractAddress = '0x...'; // Replace with actual contract address
                const contractABI = [
                    {
                        "inputs": [
                            {"internalType": "address", "name": "to", "type": "address"},
                            {"internalType": "uint256", "name": "amount", "type": "uint256"}
                        ],
                        "name": "mintReward",
                        "outputs": [],
                        "stateMutability": "nonpayable",
                        "type": "function"
                    }
                ];
                
                this.contract = new this.web3.eth.Contract(contractABI, contractAddress);
                
                document.getElementById('wallet-status').textContent = `Connected: ${this.userAccount.slice(0, 6)}...${this.userAccount.slice(-4)}`;
                document.getElementById('connect-wallet').style.display = 'none';
                document.getElementById('disconnect-wallet').style.display = 'inline-block';
                
                return true;
            } catch (error) {
                console.error('Failed to connect MetaMask:', error);
                alert('Failed to connect MetaMask. Please try again.');
                return false;
            }
        } else {
            alert('MetaMask is not installed. Please install MetaMask to use this feature.');
            return false;
        }
    }

    async disconnectWallet() {
        this.web3 = null;
        this.contract = null;
        this.userAccount = null;
        
        document.getElementById('wallet-status').textContent = 'Not connected';
        document.getElementById('connect-wallet').style.display = 'inline-block';
        document.getElementById('disconnect-wallet').style.display = 'none';
    }

    async loadPayrollQueue() {
        try {
            const response = await fetch('/api/admin/payroll-queue');
            const data = await response.json();
            this.payrollQueue = data.queue || [];
        } catch (error) {
            console.error('Failed to load payroll queue:', error);
            this.payrollQueue = [
                {
                    id: 1,
                    userId: 'user123',
                    walletAddress: '0x742d35Cc6601C2C4b8f8D9A2C2e0C0e1e4A0B1c3',
                    amount: 150.5,
                    reason: 'Bug fix submission',
                    dateCreated: '2024-01-15T10:30:00Z',
                    status: 'pending'
                },
                {
                    id: 2,
                    userId: 'user456',
                    walletAddress: '0x8e2d4A3b5C6f7E8d9A0B1c2D3e4F5a6B7c8D9e0F',
                    amount: 75.25,
                    reason: 'Feature enhancement',
                    dateCreated: '2024-01-14T14:20:00Z',
                    status: 'pending'
                },
                {
                    id: 3,
                    userId: 'user789',
                    walletAddress: '0x123f4A5b6C7d8E9f0A1b2C3d4E5f6A7b8C9d0E1f',
                    amount: 200.0,
                    reason: 'Security vulnerability report',
                    dateCreated: '2024-01-13T09:15:00Z',
                    status: 'pending'
                }
            ];
        }
    }

    renderPayrollTable() {
        const tbody = document.querySelector('#payroll-table tbody');
        tbody.innerHTML = '';

        if (this.payrollQueue.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No pending payments</td></tr>';
            return;
        }

        this.payrollQueue.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${payment.id}</td>
                <td>${payment.userId}</td>
                <td class="wallet-address" title="${payment.walletAddress}">
                    ${payment.walletAddress.slice(0, 6)}...${payment.walletAddress.slice(-4)}
                </td>
                <td>${payment.amount.toFixed(2)} BNUT</td>
                <td>${payment.reason}</td>
                <td>${new Date(payment.dateCreated).toLocaleDateString()}</td>
                <td>
                    <span class="badge badge-${payment.status === 'pending' ? 'warning' : payment.status === 'completed' ? 'success' : 'danger'}">
                        ${payment.status}
                    </span>
                    ${payment.status === 'pending' ? `
                        <button class="btn btn-sm btn-success ms-2" onclick="adminPayroll.settlePayment(${payment.id})">
                            Settle
                        </button>
                    ` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });

        this.updateSummary();
    }

    updateSummary() {
        const totalPending = this.payrollQueue
            .filter(p => p.status === 'pending')
            .reduce((sum, p) => sum + p.amount, 0);
        
        const pendingCount = this.payrollQueue.filter(p => p.status === 'pending').length;
        
        document.getElementById('total-pending').textContent = `${totalPending.toFixed(2)} BNUT`;
        document.getElementById('pending-count').textContent = pendingCount;
    }

    async settlePayment(paymentId) {
        if (!this.contract) {
            const connected = await this.connectMetaMask();
            if (!connected) return;
        }

        const payment = this.payrollQueue.find(p => p.id === paymentId);
        if (!payment) {
            alert('Payment not found');
            return;
        }

        if (payment.status !== 'pending') {
            alert('Payment is not in pending status');
            return;
        }

        try {
            // Convert amount to wei (assuming 18 decimals for BNUT token)
            const amountWei = this.web3.utils.toWei(payment.amount.toString(), 'ether');
            
            // Show confirmation dialog
            const confirmed = confirm(
                `Settle payment of ${payment.amount} BNUT to ${payment.walletAddress}?\n` +
                `Reason: ${payment.reason}`
            );
            
            if (!confirmed) return;

            // Update UI to show processing
            document.querySelector(`button[onclick="adminPayroll.settlePayment(${paymentId})"]`)
                .innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';

            // Call smart contract
            const gasEstimate = await this.contract.methods
                .mintReward(payment.walletAddress, amountWei)
                .estimateGas({ from: this.userAccount });

            const transaction = await this.contract.methods
                .mintReward(payment.walletAddress, amountWei)
                .send({
                    from: this.userAccount,
                    gas: Math.floor(gasEstimate * 1.2)
                });

            // Update payment status
            await this.updatePaymentStatus(paymentId, 'completed', transaction.transactionHash);
            
            // Refresh table
            await this.loadPayrollQueue();
            this.renderPayrollTable();
            
            alert(`Payment settled successfully!\nTransaction: ${transaction.transactionHash}`);
            
        } catch (error) {
            console.error('Failed to settle payment:', error);
            alert(`Failed to settle payment: ${error.message}`);
            
            // Reset button
            document.querySelector(`button[onclick="adminPayroll.settlePayment(${paymentId})"]`)
                .innerHTML = 'Settle';
        }
    }

    async batchSettle() {
        const pendingPayments = this.payrollQueue.filter(p => p.status === 'pending');
        
        if (pendingPayments.length === 0) {
            alert('No pending payments to settle');
            return;
        }

        if (!this.contract) {
            const connected = await this.connectMetaMask();
            if (!connected) return;
        }

        const totalAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
        const confirmed = confirm(
            `Settle ${pendingPayments.length} payments totaling ${totalAmount.toFixed(2)} BNUT?`
        );
        
        if (!confirmed) return;

        const batchButton = document.getElementById('batch-settle');
        batchButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
        batchButton.disabled = true;

        let successCount = 0;
        let failCount = 0;

        for (const payment of pendingPayments) {
            try {
                const amountWei = this.web3.utils.toWei(payment.amount.toString(), 'ether');
                
                const gasEstimate = await this.contract.methods
                    .mintReward(payment.walletAddress, amountWei)
                    .estimateGas({ from: this.userAccount });

                const transaction = await this.contract.methods
                    .mintReward(payment.walletAddress, amountWei)
                    .send({
                        from: this.userAccount,
                        gas: Math.floor(gasEstimate * 1.2)
                    });

                await this.updatePaymentStatus(payment.id, 'completed', transaction.transactionHash);
                successCount++;
                
            } catch (error) {
                console.error(`Failed to settle payment ${payment.id}:`, error);
                await this.updatePaymentStatus(payment.id, 'failed', null);
                failCount++;
            }
        }

        // Refresh data and UI
        await this.loadPayrollQueue();
        this.renderPayrollTable();

        // Reset button
        batchButton.innerHTML = 'Settle All Pending';
        batchButton.disabled = false;

        alert(`Batch settlement completed!\nSuccessful: ${successCount}\nFailed: ${failCount}`);
    }

    async updatePaymentStatus(paymentId, status, txHash) {
        try {
            await fetch('/api/admin/update-payment-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    paymentId,
                    status,
                    transactionHash: txHash
                })
            });
        } catch (error) {
            console.error('Failed to update payment status:', error);
            // Update locally for demo
            const payment = this.payrollQueue.find(p => p.id === paymentId);
            if (payment) {
                payment.status = status;
                if (txHash) payment.transactionHash = txHash;
            }
        }
    }

    filterPayments() {
        const statusFilter = document.getElementById('status-filter').value;
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        
        let filtered = this.payrollQueue;
        
        if (statusFilter !== 'all') {
            filtered = filtered.filter(p => p.status === statusFilter);
        }
        
        if (searchTerm) {
            filtered = filtered.filter(p => 
                p.userId.toLowerCase().includes(searchTerm) ||
                p.walletAddress.toLowerCase().includes(searchTerm) ||
                p.reason.toLowerCase().includes(searchTerm)
            );
        }
        
        // Temporarily store original queue and render filtered results
        const originalQueue = this.payrollQueue;
        this.payrollQueue = filtered;
        this.renderPayrollTable();
        this.payrollQueue = originalQueue;
    }

    setupEventListeners() {
        document.getElementById('connect-wallet').addEventListener('click', () => this.connectMetaMask());
        document.getElementById('disconnect-wallet').addEventListener('click', () => this.disconnectWallet());
        document.getElementById('batch-settle').addEventListener('click', () => this.batchSettle());
        document.getElementById('refresh-queue').addEventListener('click', () => {
            this.loadPayrollQueue().then(() => this.renderPayrollTable());
        });
        
        document.getElementById('status-filter').addEventListener('change', () => this.filterPayments());
        document.getElementById('search-input').addEventListener('input', () => this.filterPayments());
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadPayrollQueue().then(() => this.renderPayrollTable());
        }, 30000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPayroll = new AdminPayroll();
});