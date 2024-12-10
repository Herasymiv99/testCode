import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { getManageSubscriptionActionsList, getPaymentMethodSectionActionsList } from './services/action-schema';
import { shouldShowBillingSection } from 'src/services/subscription-service-getters';
import { PaymentMethodSection } from 'src/components/PaymentMethodSection';
import { useSubscriptionActionProvider } from 'src/hooks/useSubscriptionActionProvider';
import { UserSection } from 'src/components/UserSection';
import { DomainsSection } from 'src/components/DomainsSection';
import { UsageSection } from 'src/components/SubscriptionUsageSection';
import { PaymentMethodDetails, SubscriptionUsage } from 'src/@types/sso-api';
import { BillingSection } from 'src/components/BillingSection';
import { PaginationData } from 'src/@types/pagination';
import { useReloadPage, useSnackbarMessage } from 'src/hooks';
import {
    BillingRecordModel,
    DomainModel,
    SubscriptionModel,
    SubscriptionUserModel,
} from 'src/@types/subscription-service-api';
import { ManagerSection } from 'src/components/ManagerSection';
import {
    getProfileSubscription,
    getProfileSubscriptionBillingRecord,
    getProfileSubscriptionDomains,
    getProfileSubscriptionManagers,
    getProfileSubscriptionPaymentMethod,
    getProfileSubscriptionUsage,
    getProfileSubscriptionUsers,
} from 'src/services/sso-api';
import {
    DEFAULT_PAGINATION_DATA,
    PROFILE_SECTION_PAGE_SIZE,
    SnackbarMessageVariants,
    SubscriptionType,
} from 'src/constants';
import { SubscriptionManageHeader } from 'src/components/SubscriptionManageHeader';
import PageTitle from 'src/components/PageTitle';
import { BasicLayout, CenteredFullScreenLayout } from 'src/layouts';
import { APIClientResponseHTTPError } from 'src/@types/api-client';
import { NotFoundPage } from 'src/pages/NotFound';
import { ServerErrorPage } from 'src/pages/ServerError';
import { Spinner } from 'src/components/Spinner';

const ProfileSubscriptionManage: FC = () => {
    const [error, setError] = useState<APIClientResponseHTTPError>();
    const [subscription, setSubscription] = useState<SubscriptionModel>();

    const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDetails>();
    const [billingRecords, setBillingRecords] = useState<Array<BillingRecordModel>>([]);
    const [managers, setManagers] = useState<Array<SubscriptionUserModel>>([]);
    const [usersData, setUsersData] = useState<SubscriptionUserModel[]>([]);
    const [domains, setDomains] = useState<DomainModel[]>([]);

    const [paymentsPagination, setPaymentsPagination] = useState<PaginationData>(DEFAULT_PAGINATION_DATA);
    const [managersPagination, setManagersPagination] = useState<PaginationData>(DEFAULT_PAGINATION_DATA);
    const [domainsPagination, setDomainsPagination] = useState<PaginationData>(DEFAULT_PAGINATION_DATA);
    const [usersPagination, setUsersPagination] =
        useState<PaginationData>({ ...DEFAULT_PAGINATION_DATA, pageSize: 15 });

    const [usage, setUsage] = useState<SubscriptionUsage>();

    const [isManagersLoading, setIsManagersLoading] = useState<boolean>(false);
    const [isPaymentItemsLoading, setIsPaymentItemsLoading] = useState<boolean>(false);
    const [isPaymentMethodLoading, setIsPaymentMethodLoading] = useState<boolean>(false);
    const [isDomainsLoading, setIsDomainsLoading] = useState<boolean>(false);
    const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);

    const { addMessage } = useSnackbarMessage();
    const { uuid = '' } = useParams<{ uuid: string }>();
    const { pageReloadCount } = useReloadPage();
    const { isActionAllowed } = useSubscriptionActionProvider(uuid, 'profile');

    const getPaymentMethod = async (loadedSubscription: SubscriptionModel) => {
        if (!shouldShowBillingSection(loadedSubscription)) {
            return;
        }

        setIsPaymentMethodLoading(true);
        return getProfileSubscriptionPaymentMethod(loadedSubscription.uuid)
            .then(setPaymentMethod)
            .catch(() => addMessage('Failed to load payment method data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsPaymentMethodLoading(false));
    };

    const getPayments = async () => {
        setIsPaymentItemsLoading(true);
        return getProfileSubscriptionBillingRecord(uuid, {
            page: paymentsPagination?.currentPage,
            pageSize: paymentsPagination?.pageSize || PROFILE_SECTION_PAGE_SIZE,
        })
            .then(({ data, ...paginationData }) => {
                setBillingRecords(data);
                setPaymentsPagination(paginationData);
            })
            .catch(() => addMessage('Failed to load billing record data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsPaymentItemsLoading(false));
    };

    const getManagers = async () => {
        setIsManagersLoading(true);
        return getProfileSubscriptionManagers(uuid, {
            page: managersPagination?.currentPage,
            pageSize: managersPagination?.pageSize || PROFILE_SECTION_PAGE_SIZE,
        })
            .then(({ data, ...paginationData }) => {
                setManagers(data);
                setManagersPagination(paginationData);
            })
            .catch(() => addMessage('Failed to load managers data', SnackbarMessageVariants.WARNING))
            .finally(() => setIsManagersLoading(false));
    };

    const getDomains = async () => {
        setIsDomainsLoading(true);
        return getProfileSubscriptionDomains(uuid, {
            page: domainsPagination.currentPage,
            pageSize: domainsPagination.pageSize,
        })
            .then(({
                data,
                ...paginationData
            }) => {
                setDomainsPagination(paginationData);
                setDomains(data);
            })
            .catch(() => addMessage('Failed to load domains data', SnackbarMessageVariants.WARNING))
            .finally(() => {
                setIsDomainsLoading(false);
            });

    };

    const getUsers = async () => {
        setIsUsersLoading(true);
        return getProfileSubscriptionUsers(uuid, {
            page: usersPagination.currentPage,
            pageSize: usersPagination.pageSize,
        })
            .then(({ data, ...paginationData }) => {
                setUsersPagination(paginationData);
                setUsersData(data);
            })
            .catch(() => addMessage('Failed to load users data', SnackbarMessageVariants.WARNING))
            .finally(() => {
                setIsUsersLoading(false);
            });
    };

    useEffect(() => {
        if (!subscription) {
            return;
        }

        getDomains();
    }, [domainsPagination.pageSize, domainsPagination.currentPage]);

    useEffect(() => {
        if (!subscription) {
            return;
        }

        getPayments();
    }, [paymentsPagination.pageSize, paymentsPagination.currentPage]);

    useEffect(() => {
        if (!subscription) {
            return;
        }

        getManagers();
    }, [managersPagination.pageSize, managersPagination.currentPage]);

    useEffect(() => {
        if (!subscription) {
            return;
        }

        getUsers();
    }, [usersPagination.pageSize, usersPagination.currentPage]);

    useEffect(() => {
        setIsManagersLoading(true);
        setIsPaymentItemsLoading(true);
        setIsDomainsLoading(true);
        setIsUsersLoading(true);

        getProfileSubscription(uuid)
            .then(async (fetchedSubscription) => {
                await getProfileSubscriptionUsage(uuid)
                    .then(setUsage)
                    .catch(() => addMessage('Failed to load usage data', SnackbarMessageVariants.WARNING));

                if (fetchedSubscription.type === SubscriptionType.ENTERPRISE) {
                    await Promise.all([
                        getDomains(),
                        getUsers(),
                    ]);
                }

                await Promise.all([
                    getManagers(),
                    getPayments(),
                    getPaymentMethod(fetchedSubscription),
                ]);

                return fetchedSubscription;
            })
            .then(setSubscription)
            .catch(({ responseError }) => setError(responseError));
    }, [uuid, pageReloadCount]);

    if (error) {
        return [404, 403].includes(error.status) ? <NotFoundPage /> : <ServerErrorPage />;
    }

    if (!subscription) {
        return (
            <CenteredFullScreenLayout>
                <Spinner />
            </CenteredFullScreenLayout>
        );
    }

    return (
        <BasicLayout testId="subscription-manage-page">
            <Box position="relative">
                <PageTitle title="Manage subscription" marginBottom={{ xs: 2.5, md: 3 }} />
                <SubscriptionManageHeader
                    managers={managers}
                    subscription={subscription}
                    actionsList={getManageSubscriptionActionsList(isActionAllowed)}
                />
                <BillingSection
                    isLoading={isPaymentItemsLoading}
                    paginationModel={paymentsPagination}
                    setPagination={setPaymentsPagination}
                    billingRecords={billingRecords}
                    subscription={subscription}
                    variant="profile"
                />
                {subscription.type === SubscriptionType.ENTERPRISE && !!usage && (
                    <UsageSection usage={usage} variant="profile" />
                )}
                <ManagerSection
                    managers={managers}
                    subscription={subscription}
                    isLoading={isManagersLoading}
                    paginationModel={managersPagination}
                    setPagination={setManagersPagination}
                />
                {subscription.type === SubscriptionType.ENTERPRISE && (
                    <DomainsSection
                        domains={domains}
                        subscription={subscription}
                        paginationModel={domainsPagination}
                        setPagination={setDomainsPagination}
                        isLoading={isDomainsLoading}
                    />
                )}
                {shouldShowBillingSection(subscription) && (
                    <PaymentMethodSection
                        isLoading={isPaymentMethodLoading}
                        paymentMethod={paymentMethod}
                        actionsList={getPaymentMethodSectionActionsList(paymentMethod)}
                    />
                )}
                {subscription.type === SubscriptionType.ENTERPRISE && (
                    <UserSection
                        users={usersData}
                        isLoading={isUsersLoading}
                        paginationModel={usersPagination}
                        setPagination={setUsersPagination}
                    />
                )}
            </Box>
        </BasicLayout>
    );
};

export default ProfileSubscriptionManage;
