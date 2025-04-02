import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import {
    getBillingSectionActionsList,
    getManagerSectionActionsList,
    getUdbManageSubscriptionActionsList,
} from './services/action-schema';
import { usePaginationParams } from 'src/hooks/usePaginationParams';
import { usePolling } from 'src/hooks/usePolling';
import { BillingAddressSection } from 'src/components/BillingAddressSection';
import { PricingTermsSection } from 'src/components/PricingTermsSection';
import { shouldShowSection } from 'src/services/subscription-service-getters';
import { CustomerInfo, SubscriptionPaymentMethodDetails } from 'src/@types/sso-api';
import { getCustomerInfo, getSubscriptionPaymentMethod } from 'src/services/sso-api';
import { Scope, useUserCan } from 'src/hooks/useUserCan';
import { useSubscriptionActionProvider } from 'src/hooks/useSubscriptionActionProvider';
import { SubscriptionManageHeader } from 'src/components/SubscriptionManageHeader';
import { UserSection } from 'src/components/UserSection';
import { UsageSection } from 'src/components/SubscriptionUsageSection';
import { DomainsSection } from 'src/components/DomainsSection';
import { BillingSection } from 'src/components/BillingSection';
import { PaymentMethodSection } from 'src/components/PaymentMethodSection';
import type { RootState } from 'src/redux/root-reducer';
import {
    clearCurrentBillingRecord,
    clearUpcomingBillingRecord,
    setCurrentBillingRecord,
    setUpcomingBillingRecord,
    subscriptionSelector,
    SubscriptionState,
} from 'src/redux/slices/subscription';
import {
    calculateRenewalIndex,
    geBillingRecord,
    getCustomPricingTerms,
    getManagers,
    getSubscription,
    getSubscriptionDomains,
    getSubscriptionUsers,
} from 'src/services/subscription-service-api';
import { ManagerSection } from 'src/components/ManagerSection';
import { useSnackbarMessage } from 'src/hooks';
import {
    actionErrorCodes,
    DEFAULT_PAGINATION_DATA,
    SnackbarMessageVariants,
    SubscriptionAction,
    SubscriptionStatus,
    SubscriptionType,
} from 'src/constants';
import { useReloadPage } from 'src/hooks/useReloadPage';
import PageTitle from 'src/components/PageTitle';
import { BasicLayout, CenteredFullScreenLayout } from 'src/layouts';
import { searchUsers } from 'src/services/unified-db-api';
import { APIClientResponseHTTPError } from 'src/@types/api-client';
import { NotFoundPage } from 'src/pages/NotFound';
import { ServerErrorPage } from 'src/pages/ServerError';
import { Spinner } from 'src/components/Spinner';
import {
    BillingRecordWithRenewal,
    CalculatedRenewalItem,
    CustomPricingTermsModel,
    DomainModel,
    SubscriptionModel,
    SubscriptionUserModel,
} from 'src/@types/subscription-service-api';
import { prepareSubscriptionUserData } from 'src/services/subscription-formatters';
import { ManageSubscriptionNotification, ManageSubscriptionPollingNotification } from 'src/components/ManageSubscriptionNotification';
import { isPollingActiveSelector } from 'src/redux/slices';
import { useExecuteAt } from 'src/hooks/useExecuteAt';

const UdbSubscriptionManage: FC = () => {
    const [subscription, setSubscription] = useState<SubscriptionModel>();
    const [paymentItems, setPaymentItems] = useState<BillingRecordWithRenewal[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethodDetails>();
    const [customerInfo, setCustomerInfo] = useState<CustomerInfo>();
    const [pricingTerms, setPricingTerms] = useState<CustomPricingTermsModel>();
    const [usage, setUsage] = useState<CalculatedRenewalItem>();
    const [error, setError] = useState<APIClientResponseHTTPError>();
    const [managersData, setManagersData] = useState<SubscriptionUserModel[]>([]);
    const [usersData, setUsersData] = useState<SubscriptionUserModel[]>([]);
    const [isManagersLoading, setIsManagersLoading] = useState<boolean>(false);
    const [isPricingTerms, setIsPricingTerms] = useState<boolean>(false);
    const [isDomainsLoading, setIsDomainsLoading] = useState<boolean>(false);
    const [isSubscriptionLoading, setIsSubscriptionLoading] = useState<boolean>(false);
    const [isPaymentItemsLoading, setIsPaymentItemsLoading] = useState<boolean>(false);
    const [isPaymentMethodLoading, setIsPaymentMethodLoading] = useState<boolean>(false);
    const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);
    const [isCustomerInfoLoading, setIsCustomerInfoLoading] = useState<boolean>(false);
    const [domains, setDomains] = useState<DomainModel[]>([]);

    const [paymentsPagination, updatePaymentsPagination] = usePaginationParams(DEFAULT_PAGINATION_DATA);
    const [managersPagination, updateManagersPagination] = usePaginationParams(DEFAULT_PAGINATION_DATA);
    const [domainsPagination, updateDomainsPagination] = usePaginationParams(DEFAULT_PAGINATION_DATA);
    const [usersPagination, updateUsersPagination] = usePaginationParams({ ...DEFAULT_PAGINATION_DATA, pageSize: 15 });

    const { upcomingBillingRecord } = useSelector<RootState, SubscriptionState>(subscriptionSelector);
    const { addMessage } = useSnackbarMessage();
    const { uuid = '' } = useParams<{ uuid: string }>();
    const dispatch = useDispatch();
    const { pageReloadCount, reloadPage } = useReloadPage();
    const canManage = useUserCan(Scope.SUBSCRIPTIONS_SERVICE_WRITE);
    const { isActionAllowed, getActionErrors, getActionExtra } = useSubscriptionActionProvider(uuid, 'udb', !!subscription);
    const isPollingActive = useSelector<RootState, (id: string) => boolean>(isPollingActiveSelector);

    const activationOnCreationInitialBillingRecordAllowed = !getActionErrors(SubscriptionAction.ACTIVATE)?.filter(
        ({ code }) => code !== actionErrorCodes.activate.NO_BILLING_RECORD,
    ).length ;

    const readyToBeActivated = isActionAllowed(SubscriptionAction.ACTIVATE)
        && !getActionErrors(SubscriptionAction.ACTIVATE);

    const { stopPolling, pollingId, startPolling } = usePolling(async () => {
        return getSubscription(uuid)
            .then((response) => {
                if (response.updatedAt !== subscription?.updatedAt) {
                    stopPolling();
                    reloadPage();
                }
            });
    });

    useExecuteAt(startPolling, readyToBeActivated && subscription?.activationDate);

    const getPaymentMethod = async (loadedSubscription: SubscriptionModel) => {
        if (!shouldShowSection(loadedSubscription, 'paymentMethod')) {
            return;
        }

        setIsPaymentMethodLoading(true);
        return getSubscriptionPaymentMethod(loadedSubscription.uuid)
            .then(setPaymentMethod)
            .catch(() => addMessage('Failed to load payment method data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsPaymentMethodLoading(false));
    };

    const fetchCustomPricingTerms = async (loadedSubscription: SubscriptionModel) => {
        if (!shouldShowSection(loadedSubscription, 'pricingTerms')) {
            return;
        }
        setIsPricingTerms(true);
        return getCustomPricingTerms(loadedSubscription.uuid)
            .then(setPricingTerms)
            .catch(({ responseError }) => {
                if (responseError.data.status !== 404) {
                    addMessage('Failed to load pricing terms data', SnackbarMessageVariants.WARNING);
                }

                setPricingTerms(undefined);
            })
            .finally(() => setIsPricingTerms(false));
    };

    const getCustomer = async () => {
        setIsCustomerInfoLoading(true);
        return getCustomerInfo(uuid)
            .then(setCustomerInfo)
            .catch(() => addMessage('Failed to load customer data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsCustomerInfoLoading(false));
    };

    const getUsage = async (loadedSubscription: SubscriptionModel) => {
        if (!shouldShowSection(loadedSubscription, 'usage')) {
            return;
        }

        return calculateRenewalIndex(uuid)
            .then(setUsage)
            .catch(() => addMessage('Failed to load usage data', SnackbarMessageVariants.WARNING));
    };

    const updateManagersList = async () => {
        setIsManagersLoading(true);
        return getManagers(uuid, {
            page: managersPagination.currentPage,
            pageSize: managersPagination.pageSize,
        })
            .then(async ({ data, currentPage, ...paginationData }) => {
                const managerUUIDs = data.map((item) => item.userUUID);
                updateManagersPagination({ currentPage, ...paginationData });
                await searchUsers({
                    filterBy: {
                        filters: [{
                            name: 'uuid',
                            value: managerUUIDs,
                            comparison: 'anyOf',
                        }],
                    },
                    pageSize: managersPagination.pageSize,
                }, ['email', 'jobInfo'])
                    .then(({ data: searchUsersData }) => {
                        setManagersData(prepareSubscriptionUserData(searchUsersData, data));
                    });
            })
            .catch(() => addMessage('Failed to load managers data', SnackbarMessageVariants.WARNING))
            .finally(() => {
                setIsManagersLoading(false);
            });
    };

    const getPayments = async () => {
        setIsPaymentItemsLoading(true);
        return geBillingRecord(uuid, {
            page: paymentsPagination.currentPage,
            pageSize: paymentsPagination.pageSize,
        })
            .then(({ data, currentPage, ...paginationData }) => {
                setPaymentItems(data);
                updatePaymentsPagination({ currentPage, ...paginationData });
                if (currentPage === 1) {
                    const fetchedCurrentBillingRecord = data.find((item) => item.isCurrent);
                    const fetchedUpcomingBillingRecord = data.find((item) => item.isUpcoming);

                    dispatch(setCurrentBillingRecord(fetchedCurrentBillingRecord));
                    dispatch(setUpcomingBillingRecord(fetchedUpcomingBillingRecord));
                }
            })
            .catch(() => {
                addMessage('Failed to load billing record data', SnackbarMessageVariants.WARNING);

                if (paymentsPagination.currentPage === 1) {
                    dispatch(clearCurrentBillingRecord());
                    dispatch(clearUpcomingBillingRecord());
                }
            })
            .finally(() => {
                setIsPaymentItemsLoading(false);
            });
    };

    const getDomains = async () => {
        setIsDomainsLoading(true);
        return getSubscriptionDomains(uuid, {
            page: domainsPagination.currentPage,
            pageSize: domainsPagination.pageSize,
        })
            .then(({ data, currentPage, ...paginationData }) => {
                updateDomainsPagination({ currentPage, ...paginationData });
                setDomains(data);
            })
            .catch(() => addMessage('Failed to load domains data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsDomainsLoading(false));
    };

    const getUsers = async () => {
        setIsUsersLoading(true);
        return getSubscriptionUsers(uuid, {
            page: usersPagination.currentPage,
            pageSize: usersPagination.pageSize,
        })
            .then(({ data, currentPage, ...paginationData }) => {
                const usersUUIDs = data.map((item) => item.userUUID);
                updateUsersPagination({ currentPage, ...paginationData });
                searchUsers({
                    filterBy: {
                        filters: [{
                            name: 'uuid',
                            value: usersUUIDs,
                            comparison: 'anyOf',
                        }],
                    },
                    pageSize: usersPagination.pageSize,
                }, ['email', 'jobInfo'])
                    .then(({ data: searchUsersData }) => {
                        setUsersData(prepareSubscriptionUserData(searchUsersData, data));
                    });
            })
            .catch(() => addMessage('Failed to load users data', SnackbarMessageVariants.WARNING))
            .finally(() => {
                setIsUsersLoading(false);
            });
    };

    useEffect(() => {
        if (!subscription || !domainsPagination.pageSize || !domainsPagination.currentPage) {
            return;
        }

        getDomains();
    }, [domainsPagination.pageSize, domainsPagination.currentPage]);

    useEffect(() => {
        if (!subscription || !paymentsPagination.pageSize || !paymentsPagination.currentPage) {
            return;
        }

        getPayments();
    }, [paymentsPagination.pageSize, paymentsPagination.currentPage]);

    useEffect(() => {
        if (!subscription || !managersPagination.pageSize || !managersPagination.currentPage) {
            return;
        }

        updateManagersList();
    }, [managersPagination.pageSize, managersPagination.currentPage]);

    useEffect(() => {
        if (!subscription || !usersPagination.pageSize || !usersPagination.currentPage) {
            return;
        }

        getUsers();
    }, [usersPagination.pageSize, usersPagination.currentPage]);

    useEffect(() => {
        setIsSubscriptionLoading(true);

        getSubscription(uuid)
            .then(async (fetchedSubscription) => {
                setSubscription(fetchedSubscription);

                let dataPromises: Array<Promise<void | number | string>> = [];
                if (fetchedSubscription.type === SubscriptionType.ENTERPRISE) {
                    dataPromises = [
                        getDomains(),
                        getUsers(),
                    ];
                }

                await Promise.all([
                    getPayments(),
                    getCustomer(),
                    updateManagersList(),
                    getUsage(fetchedSubscription),
                    getPaymentMethod(fetchedSubscription),
                    fetchCustomPricingTerms(fetchedSubscription),
                    ...dataPromises,
                ]);
            })
            .catch(({ responseError }) => {
                setError(responseError);
                dispatch(clearCurrentBillingRecord());
                dispatch(clearUpcomingBillingRecord());
            })
            .finally(() => {
                setIsSubscriptionLoading(false);
            });
    }, [uuid, pageReloadCount]);

    if (error) {
        return [404, 403].includes(error.data?.status as number) ? <NotFoundPage /> : <ServerErrorPage />;
    }

    if (!subscription) {
        return (
            <CenteredFullScreenLayout>
                <Spinner />
            </CenteredFullScreenLayout>
        );
    }

    return (
        <BasicLayout testId="subscription-manage-uuid-page">
            <Box position="relative">
                <PageTitle
                    title="Manage subscription"
                    marginBottom={{
                        xs: 2.5,
                        sm: 3,
                    }}
                />
                {subscription.status === SubscriptionStatus.DRAFT && (
                    <ManageSubscriptionNotification
                        activationDate={subscription.activationDate}
                        allowed={isActionAllowed(SubscriptionAction.ACTIVATE)}
                        errors={getActionErrors(SubscriptionAction.ACTIVATE)}
                    />
                )}
                {isPollingActive(pollingId) && (
                    <ManageSubscriptionPollingNotification />
                )}
                <SubscriptionManageHeader
                    isUdb
                    subscription={subscription}
                    managers={managersData}
                    isLoaded={!isSubscriptionLoading}
                    actionsList={getUdbManageSubscriptionActionsList({
                        billingRecord: upcomingBillingRecord,
                        isActionAllowed,
                        getActionExtra,
                        subscription,
                        canManage,
                    })}
                />
                {shouldShowSection(subscription, 'usage') && usage && (
                    <UsageSection usage={usage} variant="udb" />
                )}
                {shouldShowSection(subscription, 'pricingTerms') && pricingTerms && (
                    <PricingTermsSection
                        customAttributes={subscription?.customAttributes}
                        isLoading={isSubscriptionLoading && isPricingTerms}
                        pricingTerms={pricingTerms}
                        status={subscription.status}
                        subscriptionUUID={subscription.uuid}
                    />
                )}
                <BillingSection
                    isLoading={isSubscriptionLoading && isPaymentItemsLoading}
                    paginationModel={paymentsPagination}
                    actionsList={getBillingSectionActionsList({
                        isActionAllowed,
                        billingType: subscription.billingType,
                        isActivationAllowed: activationOnCreationInitialBillingRecordAllowed,
                        pollingId,
                    })}
                    setPagination={updatePaymentsPagination}
                    pollingId={pollingId}
                    billingRecords={paymentItems}
                    subscription={subscription}
                    isActivationAllowed={isActionAllowed(SubscriptionAction.ACTIVATE)}
                    variant="udb"
                />
                <ManagerSection
                    hasUserLink
                    withRemoveButton
                    isLoading={isSubscriptionLoading || isManagersLoading}
                    managers={managersData}
                    actionsList={getManagerSectionActionsList(managersData, subscription)}
                    subscription={subscription}
                    paginationModel={managersPagination}
                    setPagination={updateManagersPagination}
                />
                {subscription.type === SubscriptionType.ENTERPRISE && (
                    <DomainsSection
                        showRemoveButton
                        showDomainActions
                        domains={domains}
                        subscription={subscription}
                        paginationModel={domainsPagination}
                        setPagination={updateDomainsPagination}
                        isLoading={isSubscriptionLoading && isDomainsLoading}
                    />
                )}
                {shouldShowSection(subscription, 'billingAddress') && customerInfo && (
                    <BillingAddressSection
                        isUdb
                        status={subscription.status}
                        uuid={subscription.uuid}
                        isLoading={isSubscriptionLoading && isCustomerInfoLoading}
                        customerInfo={customerInfo}
                    />
                )}
                {shouldShowSection(subscription, 'paymentMethod') && (
                    <PaymentMethodSection
                        isLoading={isPaymentMethodLoading}
                        paymentMethod={paymentMethod}
                    />
                )}
                {subscription.type === SubscriptionType.ENTERPRISE && (
                    <UserSection
                        hasUserLink
                        users={usersData}
                        isLoading={isSubscriptionLoading && isUsersLoading}
                        paginationModel={usersPagination}
                        setPagination={updateUsersPagination}
                    />
                )}
            </Box>
        </BasicLayout>
    );
};

export default UdbSubscriptionManage;
